/**************** AUTH ****************/
const token = sessionStorage.getItem("token");
const chatWith = sessionStorage.getItem("chatWith");

if (!token || !chatWith) location.href = "login.html";
document.getElementById("chatWith").innerText = chatWith;

/**************** SOCKET ****************/
const socket = io("https://private-chat-ftj0.onrender.com", {
  auth: { token }
});

/**************** DOM ****************/
const chatBox = document.getElementById("chatMessages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const typingDiv = document.getElementById("typingIndicator");

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

const audioCallBtn = document.getElementById("audioCallBtn");
const videoCallBtn = document.getElementById("videoCallBtn");
const muteBtn = document.getElementById("muteBtn");
const endCallBtn = document.getElementById("endCallBtn");

const callScreen = document.getElementById("callScreen");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

/**************** CHAT ****************/
sendBtn.onclick = sendMessage;
input.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  const msg = {
    to: chatWith,
    text,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  };

  renderMessage(msg, true);
  socket.emit("private_message", msg);
  input.value = "";
}

socket.on("private_message", msg => {
  renderMessage(msg, false);
});

function renderMessage(msg, isMe) {
  const div = document.createElement("div");
  div.className = `message ${isMe ? "user" : "helper"}`;
  div.innerHTML = `
    <div class="text">${msg.text}</div>
    <span class="time">${msg.time}</span>
  `;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

/**************** TYPING ****************/
let typingTimeout;
input.addEventListener("input", () => {
  socket.emit("typing", { to: chatWith });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("stop_typing", { to: chatWith });
  }, 700);
});

socket.on("typing", () => typingDiv.style.display = "block");
socket.on("stop_typing", () => typingDiv.style.display = "none");

/**************** STATUS ****************/
socket.on("connect", () => {
  socket.emit("check_status", { email: chatWith });
});

socket.on("status_result", d => {
  if (d.email === chatWith) {
    statusDot.className = `dot ${d.status}`;
    statusText.innerText = d.status;
  }
});

/**************** CALLING (TURN ENABLED) ****************/
let peerConnection;
let localStream;
let callType = "audio";
let muted = false;

const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: [
        "turn:global.relay.metered.ca:80",
        "turn:global.relay.metered.ca:443",
        "turn:global.relay.metered.ca:443?transport=tcp"
      ],
      username: "PASTE_METERED_USERNAME",
      credential: "PASTE_METERED_PASSWORD"
    }
  ]
};

audioCallBtn.onclick = () => startCall("audio");
videoCallBtn.onclick = () => startCall("video");

async function startCall(type) {
  callType = type;

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: type === "video"
  });

  peerConnection = new RTCPeerConnection(servers);
  localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

  peerConnection.ontrack = e => {
    remoteVideo.srcObject = e.streams[0];
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("webrtc_ice", { to: chatWith, candidate: e.candidate });
    }
  };

  if (type === "video") {
    callScreen.style.display = "block";
    localVideo.srcObject = localStream;
  }

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("webrtc_offer", { to: chatWith, offer, callType: type });

  muteBtn.style.display = "inline";
  endCallBtn.style.display = "inline";
}

socket.on("webrtc_offer", async data => {
  if (!confirm(`Incoming ${data.callType} call`)) return;

  callType = data.callType;

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: callType === "video"
  });

  peerConnection = new RTCPeerConnection(servers);
  localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

  peerConnection.ontrack = e => {
    remoteVideo.srcObject = e.streams[0];
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("webrtc_ice", { to: data.from, candidate: e.candidate });
    }
  };

  if (callType === "video") {
    callScreen.style.display = "block";
    localVideo.srcObject = localStream;
  }

  await peerConnection.setRemoteDescription(data.offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("webrtc_answer", { to: data.from, answer });

  muteBtn.style.display = "inline";
  endCallBtn.style.display = "inline";
});

socket.on("webrtc_answer", d => {
  peerConnection.setRemoteDescription(d.answer);
});

socket.on("webrtc_ice", d => {
  peerConnection.addIceCandidate(d.candidate);
});

muteBtn.onclick = () => {
  localStream.getAudioTracks().forEach(t => (t.enabled = muted));
  muted = !muted;
  muteBtn.innerText = muted ? "🔊" : "🔕";
};

endCallBtn.onclick = () => {
  peerConnection.close();
  localStream.getTracks().forEach(t => t.stop());
  callScreen.style.display = "none";
  socket.emit("call_end", { to: chatWith });
};

socket.on("call_ended", () => {
  endCallBtn.click();
});
