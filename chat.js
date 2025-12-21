// ================= AUTH =================
const token = sessionStorage.getItem("token");
const myEmail = sessionStorage.getItem("email");
const chatWith = sessionStorage.getItem("chatWith");

if (!token || !chatWith) location.href = "login.html";
document.getElementById("chatWith").innerText = chatWith;

// ================= SOCKET =================
const socket = io("https://private-chat-ftj0.onrender.com", {
  auth: { token }
});

// ================= DOM =================
const chatBox = document.getElementById("chatMessages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const picker = document.getElementById("reactionPicker");
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

// ================= CHAT =================
let selectedMessageId = null;
let typingTimeout;

sendBtn.onclick = sendMessage;
input.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  const msg = {
    id: Date.now(),
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
  socket.emit("seen", { id: msg.id, to: msg.from });
});

// ================= TYPING =================
input.addEventListener("input", () => {
  socket.emit("typing", { to: chatWith });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("stop_typing", { to: chatWith });
  }, 700);
});

socket.on("typing", () => {
  typingDiv.style.display = "block";
});

socket.on("stop_typing", () => {
  typingDiv.style.display = "none";
});

// ================= STATUS =================
socket.on("connect", () => {
  socket.emit("check_status", { email: chatWith });
});

socket.on("status_result", d => {
  if (d.email === chatWith) {
    statusDot.className = `dot ${d.status}`;
    statusText.innerText = d.status;
  }
});

socket.on("user_status", d => {
  if (d.email === chatWith) {
    statusDot.className = `dot ${d.status}`;
    statusText.innerText = d.status;
  }
});

// ================= RENDER MESSAGE =================
function renderMessage(msg, isMe) {
  const div = document.createElement("div");
  div.className = `message ${isMe ? "user" : "helper"}`;
  div.dataset.id = msg.id;

  div.innerHTML = `
    <div class="text">${msg.text}</div>
    <span class="time">${msg.time}</span>
    ${isMe ? `
      <div class="actions">
        <button onclick="editMessage(${msg.id})">✏️</button>
        <button onclick="deleteMessage(${msg.id})">🗑️</button>
      </div>` : ""}
  `;

  let timer;
  div.onmousedown = () => {
    timer = setTimeout(() => {
      selectedMessageId = msg.id;
      picker.style.display = "block";
    }, 600);
  };
  div.onmouseup = () => clearTimeout(timer);
  div.ontouchstart = div.onmousedown;
  div.ontouchend = div.onmouseup;

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ================= EDIT / DELETE =================
function editMessage(id) {
  const newText = prompt("Edit message");
  if (!newText) return;
  document.querySelector(`[data-id='${id}'] .text`).innerText = newText;
  socket.emit("edit_message", { id, to: chatWith, text: newText });
}

socket.on("edit_message", d => {
  document.querySelector(`[data-id='${d.id}'] .text`).innerText = d.text;
});

function deleteMessage(id) {
  document.querySelector(`[data-id='${id}']`)?.remove();
  socket.emit("delete_message", { id, to: chatWith });
}

socket.on("delete_message", d => {
  document.querySelector(`[data-id='${d.id}']`)?.remove();
});

// ================= EMOJI =================
function sendReaction(emoji) {
  if (!selectedMessageId) return;
  const div = document.querySelector(`[data-id='${selectedMessageId}']`);
  if (div) div.innerHTML += `<div class="reactions">${emoji}</div>`;
  socket.emit("reaction", { id: selectedMessageId, to: chatWith, emoji });
  picker.style.display = "none";
  selectedMessageId = null;
}

socket.on("reaction", d => {
  const div = document.querySelector(`[data-id='${d.id}']`);
  if (div) div.innerHTML += `<div class="reactions">${d.emoji}</div>`;
});

// ================= VOICE NOTE =================
let mediaRecorder;
let audioChunks = [];

micBtn.onclick = async () => {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = () => {
        socket.emit("voice_message", { to: chatWith, audio: reader.result });
        renderVoice(reader.result, true);
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.start();
    micBtn.classList.add("recording");
  } else {
    mediaRecorder.stop();
    micBtn.classList.remove("recording");
  }
};

socket.on("voice_message", d => {
  renderVoice(d.audio, false);
});

function renderVoice(src, isMe) {
  const div = document.createElement("div");
  div.className = `message ${isMe ? "user" : "helper"}`;
  div.innerHTML = `<audio controls src="${src}"></audio>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ================= CALLING (WEBRTC) =================
let peerConnection;
let localStream;
let callType = "audio";
let muted = false;

const servers = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: [
        "turn:global.relay.metered.ca:80",
        "turn:global.relay.metered.ca:443",
        "turn:global.relay.metered.ca:443?transport=tcp"
      ],
      username: "bd2d8f73bf3c57aa2fb0412c",
      credential: "q7brVYvWZS8q5E4B"
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
    if (e.candidate)
      socket.emit("webrtc_ice", { to: chatWith, candidate: e.candidate });
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
    if (e.candidate)
      socket.emit("webrtc_ice", { to: data.from, candidate: e.candidate });
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
  peerConnection?.addIceCandidate(d.candidate);
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

