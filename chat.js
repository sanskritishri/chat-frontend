/***********************
 * AUTH & BASIC SETUP
 ***********************/
const token = sessionStorage.getItem("token");
const myEmail = sessionStorage.getItem("email");
const chatWith = sessionStorage.getItem("chatWith");

if (!token || !chatWith) location.href = "login.html";
document.getElementById("chatWith").innerText = chatWith;

/***********************
 * SOCKET CONNECTION
 ***********************/
const socket = io("https://private-chat-ftj0.onrender.com", {
  auth: { token }
});

/***********************
 * DOM ELEMENTS
 ***********************/
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

/***********************
 * CHAT LOGIC
 ***********************/
let selectedMessageId = null;
let typingTimeout;

sendBtn.addEventListener("click", sendMessage);
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
    time: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })
  };

  renderMessage({ ...msg, from: myEmail }, true);
  socket.emit("private_message", msg);
  input.value = "";
}

socket.on("private_message", msg => {
  renderMessage(msg, false);
});

/***********************
 * TYPING INDICATOR
 ***********************/
input.addEventListener("input", () => {
  socket.emit("typing", { to: chatWith });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("stop_typing", { to: chatWith });
  }, 700);
});

socket.on("typing", () => {
  typingDiv.style.display = "block";
  typingDiv.innerText = "typing...";
});

socket.on("stop_typing", () => {
  typingDiv.style.display = "none";
});

/***********************
 * ONLINE / OFFLINE
 ***********************/
socket.on("connect", () => {
  socket.emit("check_status", { email: chatWith });
});

socket.on("status_result", data => {
  if (data.email === chatWith) {
    statusDot.className = `dot ${data.status}`;
    statusText.innerText = data.status;
  }
});

socket.on("user_status", data => {
  if (data.email === chatWith) {
    statusDot.className = `dot ${data.status}`;
    statusText.innerText = data.status;
  }
});

/***********************
 * RENDER MESSAGE
 ***********************/
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

  // long press for emoji
  let timer;
  const start = () => {
    timer = setTimeout(() => {
      selectedMessageId = msg.id;
      picker.style.display = "block";
    }, 600);
  };
  const end = () => clearTimeout(timer);

  div.addEventListener("mousedown", start);
  div.addEventListener("mouseup", end);
  div.addEventListener("mouseleave", end);
  div.addEventListener("touchstart", start);
  div.addEventListener("touchend", end);
  div.addEventListener("touchcancel", end);

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

/***********************
 * EDIT / DELETE
 ***********************/
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

/***********************
 * EMOJI
 ***********************/
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

/***********************
 * CALLING (WEBRTC)
 ***********************/
let peerConnection;
let localStream;
let callType = "audio";
let muted = false;

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
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

  localStream.getTracks().forEach(t =>
    peerConnection.addTrack(t, localStream)
  );

  peerConnection.ontrack = e => {
    remoteVideo.srcObject = e.streams[0];
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("webrtc_ice", {
        to: chatWith,
        candidate: e.candidate
      });
    }
  };

  if (type === "video") {
    callScreen.style.display = "block";
    localVideo.srcObject = localStream;
  }

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("webrtc_offer", {
    to: chatWith,
    offer,
    callType: type
  });

  muteBtn.style.display = "inline";
  endCallBtn.style.display = "inline";
}

socket.on("webrtc_offer", async data => {
  callType = data.callType;

  const accept = confirm(
    `Incoming ${callType === "video" ? "Video" : "Audio"} Call`
  );
  if (!accept) return;

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: callType === "video"
  });

  peerConnection = new RTCPeerConnection(servers);

  localStream.getTracks().forEach(t =>
    peerConnection.addTrack(t, localStream)
  );

  peerConnection.ontrack = e => {
    remoteVideo.srcObject = e.streams[0];
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("webrtc_ice", {
        to: data.from,
        candidate: e.candidate
      });
    }
  };

  if (callType === "video") {
    callScreen.style.display = "block";
    localVideo.srcObject = localStream;
  }

  await peerConnection.setRemoteDescription(data.offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("webrtc_answer", {
    to: data.from,
    answer
  });

  muteBtn.style.display = "inline";
  endCallBtn.style.display = "inline";
});

socket.on("webrtc_answer", async data => {
  await peerConnection.setRemoteDescription(data.answer);
});

socket.on("webrtc_ice", async data => {
  if (peerConnection) {
    await peerConnection.addIceCandidate(data.candidate);
  }
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

  muteBtn.style.display = "none";
  endCallBtn.style.display = "none";
};

socket.on("call_ended", () => {
  endCallBtn.click();
});
