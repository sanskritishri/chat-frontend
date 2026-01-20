const token = sessionStorage.getItem("token");
const myEmail = sessionStorage.getItem("email");
const chatWith = sessionStorage.getItem("chatWith");

if (!token || !chatWith) location.href = "login.html";

document.getElementById("chatWith").innerText = chatWith;

const socket = io("https://private-chat-ftj0.onrender.com", {
  auth: { token }
});

/* ================== DOM ================== */
const chatBox = document.getElementById("chatMessages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const typingDiv = document.getElementById("typingIndicator");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

const callScreen = document.getElementById("callScreen");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const muteBtn = document.getElementById("muteBtn");
const endCallBtn = document.getElementById("endCallBtn");
const audioCallBtn = document.getElementById("audioCallBtn");
const videoCallBtn = document.getElementById("videoCallBtn");

/* ================== MESSAGE ================== */
sendBtn.onclick = sendMessage;
input.onkeydown = e => e.key === "Enter" && sendMessage();

function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  const msg = {
    id: Date.now(),
    to: chatWith,
    text,
    time: new Date().toLocaleTimeString()
  };

  renderMessage(msg, true);
  socket.emit("private_message", msg);
  input.value = "";
}

socket.on("private_message", msg => {
  renderMessage(msg, false);
  socket.emit("seen", { id: msg.id, to: msg.from });
});

function renderMessage(msg, me) {
  const div = document.createElement("div");
  div.className = "message " + (me ? "user" : "helper");
  div.dataset.id = msg.id;

  div.innerHTML = `
    <div class="text">${me ? msg.text : `<b>${msg.from}</b>: ${msg.text}`}</div>
    <span class="time">${msg.time}</span>
  `;

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

/* ================== TYPING ================== */
let typingTimer;
input.addEventListener("input", () => {
  socket.emit("typing", { to: chatWith });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit("stop_typing", { to: chatWith });
  }, 800);
});

socket.on("typing", d => {
  typingDiv.style.display = "block";
  typingDiv.innerText = `${d.from} typing...`;
});

socket.on("stop_typing", () => {
  typingDiv.style.display = "none";
});

/* ================== STATUS ================== */
socket.emit("check_status", { email: chatWith });

socket.on("status_result", d => updateStatus(d.status));
socket.on("user_status", d => {
  if (d.email === chatWith) updateStatus(d.status);
});

function updateStatus(status) {
  statusDot.className = "dot " + status;
  statusText.innerText = status;
}

/* ================== VOICE MESSAGE ================== */
let recorder, chunks = [];

micBtn.onclick = async () => {
  if (!recorder) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      chunks = [];
      const reader = new FileReader();
      reader.onload = () => {
        socket.emit("voice_message", { to: chatWith, audio: reader.result });
        renderVoice(reader.result, true);
      };
      reader.readAsDataURL(blob);
    };
    recorder.start();
    micBtn.classList.add("recording");
  } else {
    recorder.stop();
    recorder = null;
    micBtn.classList.remove("recording");
  }
};

socket.on("voice_message", d => renderVoice(d.audio, false));

function renderVoice(src, me) {
  const div = document.createElement("div");
  div.className = "message " + (me ? "user" : "helper");
  div.innerHTML = `<audio controls src="${src}"></audio>`;
  chatBox.appendChild(div);
}

/* ================== CALL (BASIC STABLE) ================== */
audioCallBtn.onclick = () => socket.emit("call_user", { to: chatWith });
videoCallBtn.onclick = () => socket.emit("call_user", { to: chatWith });

socket.on("incoming_call", () => {
  alert("Incoming call");
});

endCallBtn.onclick = () => {
  callScreen.style.display = "none";
};

muteBtn.onclick = () => {
  localVideo.muted = !localVideo.muted;
};
