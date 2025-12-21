const token = sessionStorage.getItem("token");
const myEmail = sessionStorage.getItem("email");
const chatWith = sessionStorage.getItem("chatWith");

if (!token || !chatWith) location.href = "login.html";
document.getElementById("chatWith").innerText = chatWith;
document.getElementById("callingUserName").innerText = chatWith;

const socket = io("https://private-chat-ftj0.onrender.com", { auth: { token } });

const chatBox = document.getElementById("chatMessages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const callScreen = document.getElementById("callScreen");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// --- 1. Messaging Logic ---
sendBtn.onclick = sendMessage;
input.onkeydown = (e) => { if(e.key === "Enter") sendMessage(); };

function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    const msg = { to: chatWith, text, id: Date.now(), time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
    socket.emit("private_message", msg);
    renderMessage({ ...msg, from: myEmail }, true);
    input.value = "";
}

socket.on("private_message", msg => {
    renderMessage(msg, false);
    socket.emit("seen", { id: msg.id, to: msg.from });
});

function renderMessage(msg, isMe) {
    const div = document.createElement("div");
    div.className = `message ${isMe ? "user" : "helper"}`;
    
    let content = msg.text ? `<div>${msg.text}</div>` : `<audio controls src="${msg.voice}"></audio>`;
    
    div.innerHTML = `
        ${content}
        <div class="time-info">
            ${msg.time} ${isMe ? '<span class="tick">✔✔</span>' : ''}
        </div>
    `;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- 2. Voice Note Logic ---
let mediaRecorder;
let audioChunks = [];
micBtn.onclick = async () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                const msg = { to: chatWith, voice: reader.result, id: Date.now(), time: "Now" };
                socket.emit("private_message", msg);
                renderMessage({ ...msg, from: myEmail }, true);
            };
        };
        mediaRecorder.start();
        micBtn.classList.add("recording");
    } else {
        mediaRecorder.stop();
        micBtn.classList.remove("recording");
    }
};

// --- 3. WebRTC Calling (The Main Fix) ---
let localStream;
let pc;
const iceServers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

async function initCall(type) {
    callScreen.style.display = "flex";
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" });
    
    if(type === "video") localVideo.srcObject = localStream;
    else localVideo.style.display = "none";

    pc = new RTCPeerConnection(iceServers);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("webrtc_ice", { to: chatWith, candidate: event.candidate });
        }
    };

    if (type === "offer") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc_offer", { to: chatWith, offer, callType: type });
    }
}

document.getElementById("videoCallBtn").onclick = () => initCall("video");
document.getElementById("audioCallBtn").onclick = () => initCall("audio");

socket.on("webrtc_offer", async (data) => {
    if (confirm(`Incoming ${data.callType} call from ${chatWith}?`)) {
        await initCall(data.callType);
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc_answer", { to: chatWith, answer });
    }
});

socket.on("webrtc_answer", async (data) => {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on("webrtc_ice", async (data) => {
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
});

document.getElementById("endCallBtn").onclick = () => {
    if (pc) pc.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    callScreen.style.display = "none";
    socket.emit("call_end", { to: chatWith });
};

socket.on("call_ended", () => {
    document.getElementById("endCallBtn").click();
});
