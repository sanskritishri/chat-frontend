// ===== AUTH CHECK =====
const token = sessionStorage.getItem("token");
const myEmail = sessionStorage.getItem("email");
const chatWith = sessionStorage.getItem("chatWith");
let localStream;
let peerConnection;

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

if (!token || !chatWith) location.href = "login.html";
document.getElementById("chatWith").innerText = chatWith;

// ===== SOCKET CONNECT =====
const socket = io("https://private-chat-ftj0.onrender.com", {
  auth: { token }
});

// ===== DOM ELEMENTS =====
const chatBox = document.getElementById("chatMessages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const picker = document.getElementById("reactionPicker");
const typingDiv = document.getElementById("typingIndicator");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
// ===== CALL BUTTONS =====
const callBtn = document.getElementById("callBtn");
const endCallBtn = document.getElementById("endCallBtn");

let selectedMessageId = null;
let typingTimeout;

// ===== SEND MESSAGE =====
sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});
// ===== CALL START (TOP LEVEL) =====
callBtn.addEventListener("click", async () => {
  // 🎥 audio + video
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true
  });

  localVideo.srcObject = localStream;
  localVideo.style.display = "block";

  peerConnection = new RTCPeerConnection(servers);

  localStream.getTracks().forEach(track =>
    peerConnection.addTrack(track, localStream)
  );

  peerConnection.ontrack = e => {
    remoteVideo.srcObject = e.streams[0];
    remoteVideo.style.display = "block";
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("webrtc_ice", {
        to: chatWith,
        candidate: e.candidate
      });
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("webrtc_offer", {
    to: chatWith,
    offer
  });

  callBtn.style.display = "none";
  endCallBtn.style.display = "inline";
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

// ===== RECEIVE MESSAGE =====
socket.on("private_message", msg => {
  renderMessage(msg, false);
  socket.emit("seen", { id: msg.id, to: msg.from });
});

// ===== TYPING =====
input.addEventListener("input", () => {
 socket.emit("typing", {
  to: chatWith,
  from: myEmail
});

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
   socket.emit("stop_typing", {
  to: chatWith,
  from: myEmail
});

  }, 800);
});

socket.on("typing", data => {
  typingDiv.style.display = "block";
  typingDiv.innerText = `${data.from} is typing...`;
});

socket.on("stop_typing", () => {
  typingDiv.style.display = "none";
});

// ===== ONLINE / OFFLINE =====
socket.on("connect", () => {
  socket.emit("check_status", { email: chatWith });
});

socket.on("status_result", data => {
  if (data.email === chatWith) {
    statusDot.className = `dot ${data.status}`;
    statusText.innerText = data.status === "online" ? "Online" : "Offline";
  }
});

socket.on("user_status", data => {
  if (data.email === chatWith) {
    statusDot.className = `dot ${data.status}`;
    statusText.innerText = data.status === "online" ? "Online" : "Offline";
  }
});

// ===== RENDER MESSAGE =====
function renderMessage(msg, isMe) {
  const div = document.createElement("div");
  div.className = `message ${isMe ? "user" : "helper"}`;
  div.dataset.id = msg.id;

  div.innerHTML = `
    <div class="text">
  ${msg.text}
</div>

    <span class="time">${msg.time}</span>
    ${isMe ? `
      <div class="actions">
        <button onclick="editMessage(${msg.id})">✏️</button>
        <button onclick="deleteMessage(${msg.id})">🗑️</button>
      </div>` : ""}
  `;

  // LONG PRESS (MOBILE + DESKTOP)
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

// ===== EDIT / DELETE =====
function editMessage(id) {
  const newText = prompt("Edit message");
  if (!newText) return;
  document.querySelector(`[data-id='${id}'] .text`).innerText = newText;
  socket.emit("edit_message", { id, to: chatWith, text: newText });
}

socket.on("edit_message", data => {
  document.querySelector(`[data-id='${data.id}'] .text`).innerText = data.text;
});

function deleteMessage(id) {
  document.querySelector(`[data-id='${id}']`)?.remove();
  socket.emit("delete_message", { id, to: chatWith });
}

socket.on("delete_message", data => {
  document.querySelector(`[data-id='${data.id}']`)?.remove();
});

// ===== EMOJI =====
function sendReaction(emoji) {
  if (!selectedMessageId) return;
  const div = document.querySelector(`[data-id='${selectedMessageId}']`);
  if (div) div.innerHTML += `<div class="reactions">${emoji}</div>`;
  socket.emit("reaction", { id: selectedMessageId, to: chatWith, emoji });
  picker.style.display = "none";
  selectedMessageId = null;
}

socket.on("reaction", data => {
  const div = document.querySelector(`[data-id='${data.id}']`);
  if (div) div.innerHTML += `<div class="reactions">${data.emoji}</div>`;
});

// ===== VOICE =====
let mediaRecorder;
let audioChunks = [];

micBtn.addEventListener("click", async () => {
  try {
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
  } catch {
    alert("Microphone permission denied");
  }
});

socket.on("voice_message", data => {
  renderVoice(data.audio, false);
});
socket.on("incoming_call", async data => {
  const accept = confirm("Incoming call. Accept?");
  if (!accept) return;

  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  peerConnection = new RTCPeerConnection(servers);

  localStream.getTracks().forEach(track =>
    peerConnection.addTrack(track, localStream)
  );

  peerConnection.ontrack = e => {
    const audio = document.createElement("audio");
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
    document.body.appendChild(audio);
  };

  socket.emit("call_answer", { to: data.from });

  endCallBtn.style.display = "inline";
});

socket.on("webrtc_offer", async data => {
  const accept = confirm("Incoming call. Accept?");
  if (!accept) return;

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true
  });

  localVideo.srcObject = localStream;
  localVideo.style.display = "block";

  peerConnection = new RTCPeerConnection(servers);

  localStream.getTracks().forEach(track =>
    peerConnection.addTrack(track, localStream)
  );

  peerConnection.ontrack = e => {
    remoteVideo.srcObject = e.streams[0];
    remoteVideo.style.display = "block";
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("webrtc_ice", {
        to: data.from,
        candidate: e.candidate
      });
    }
  };

  await peerConnection.setRemoteDescription(data.offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("webrtc_answer", {
    to: data.from,
    answer
  });

  endCallBtn.style.display = "inline";
});

socket.on("webrtc_answer", async answer => {
  await peerConnection.setRemoteDescription(answer);
});

socket.on("webrtc_ice", async candidate => {
  if (peerConnection) {
    await peerConnection.addIceCandidate(candidate);
  }
});



function renderVoice(src, isMe) {
  const div = document.createElement("div");
  div.className = `message ${isMe ? "user" : "helper"}`;
  div.innerHTML = `<audio controls src="${src}"></audio>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

endCallBtn.addEventListener("click", () => {
  if (peerConnection) peerConnection.close();
  if (localStream) localStream.getTracks().forEach(t => t.stop());

  socket.emit("call_end", { to: chatWith });

  callBtn.style.display = "inline";
  endCallBtn.style.display = "none";
});

socket.on("call_ended", () => {
  if (peerConnection) peerConnection.close();
  if (localStream) localStream.getTracks().forEach(t => t.stop());

  alert("Call ended");
});


