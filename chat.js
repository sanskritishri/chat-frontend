const token = sessionStorage.getItem("token");
const myEmail = sessionStorage.getItem("email");
const chatWith = sessionStorage.getItem("chatWith");

if (!token || !chatWith) location.href = "login.html";
document.getElementById("chatWith").innerText = chatWith;

const socket = io("https://private-chat-ftj0.onrender.com", { auth: { token } });

// DOM Elements
const chatBox = document.getElementById("chatMessages");
const input = document.getElementById("messageInput");
const micBtn = document.getElementById("micBtn");
const callScreen = document.getElementById("callScreen");
const remoteVideo = document.getElementById("remoteVideo");
const localVideo = document.getElementById("localVideo");

// Voice Recording Logic
let mediaRecorder;
let audioChunks = [];

micBtn.addEventListener("click", async () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
                const base64Audio = reader.result;
                sendVoiceNote(base64Audio);
            };
        };

        mediaRecorder.start();
        micBtn.classList.add("recording");
    } else {
        mediaRecorder.stop();
        micBtn.classList.remove("recording");
    }
});

function sendVoiceNote(audioData) {
    const msg = { to: chatWith, voice: audioData, id: Date.now(), time: getTime() };
    socket.emit("private_message", msg);
    renderMessage({ ...msg, from: myEmail }, true);
}

// WebRTC Configuration
const servers = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
            urls: "turn:global.relay.metered.ca:443",
            username: "bd2d8f73bf3c57aa2fb0412c",
            credential: "q7brVVwZ58q5E4B"
        }
    ]
};

let localStream;
let peerConnection;
let callType = "audio";

async function startCall(type) {
    callType = type;
    callScreen.style.display = "flex";
    document.getElementById("callingText").innerText = `Calling ${chatWith}... (${type})`;

    localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === "video"
    });

    if (type === "video") {
        localVideo.style.display = "block";
        localVideo.srcObject = localStream;
    } else {
        localVideo.style.display = "none";
    }

    peerConnection = new RTCPeerConnection(servers);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

    peerConnection.ontrack = e => {
        remoteVideo.srcObject = e.streams[0];
    };

    peerConnection.onicecandidate = e => {
        if (e.candidate) socket.emit("webrtc_ice", { to: chatWith, candidate: e.candidate });
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("webrtc_offer", { to: chatWith, offer, callType: type });
}

socket.on("webrtc_offer", async data => {
    const accept = confirm(`Incoming ${data.callType} call from ${data.from}`);
    if (!accept) return socket.emit("call_rejected", { to: data.from });

    callType = data.callType;
    callScreen.style.display = "flex";
    
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === "video" });
    if (callType === "video") localVideo.srcObject = localStream;

    peerConnection = new RTCPeerConnection(servers);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    peerConnection.ontrack = e => remoteVideo.srcObject = e.streams[0];
    
    await peerConnection.setRemoteDescription(data.offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("webrtc_answer", { to: data.from, answer });
});

socket.on("webrtc_answer", d => peerConnection.setRemoteDescription(d.answer));
socket.on("webrtc_ice", d => peerConnection && peerConnection.addIceCandidate(d.candidate));

// UI Helpers
function getTime() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

function renderMessage(msg, isMe) {
    const div = document.createElement("div");
    div.className = `message ${isMe ? "user" : "helper"}`;
    div.dataset.id = msg.id;

    let content = msg.text ? `<div class="text">${msg.text}</div>` : 
                  `<audio controls src="${msg.voice}"></audio>`;

    div.innerHTML = `
        ${content}
        <div class="time-row">
            <span>${msg.time}</span>
            ${isMe ? '<span class="seen-tick">✔✔</span>' : ''}
        </div>
    `;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Call Buttons
document.getElementById("audioCallBtn").onclick = () => startCall("audio");
document.getElementById("videoCallBtn").onclick = () => startCall("video");
document.getElementById("endCallBtn").onclick = () => {
    if(peerConnection) peerConnection.close();
    if(localStream) localStream.getTracks().forEach(t => t.stop());
    callScreen.style.display = "none";
    socket.emit("call_end", { to: chatWith });
};

// Messaging
document.getElementById("sendBtn").onclick = sendMessage;
function sendMessage() {
    const text = input.value.trim();
    if(!text) return;
    const msg = { to: chatWith, text, id: Date.now(), time: getTime() };
    socket.emit("private_message", msg);
    renderMessage({ ...msg, from: myEmail }, true);
    input.value = "";
}

socket.on("private_message", msg => renderMessage(msg, false));
