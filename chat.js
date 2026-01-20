const token = sessionStorage.getItem("token");
const myEmail = sessionStorage.getItem("email");
const chatWith = sessionStorage.getItem("chatWith");

if (!token) location.href = "login.html";

document.getElementById("chatWith").innerText = chatWith;

const socket = io("https://private-chat-ftj0.onrender.com", {
  auth: { token }
});

// ---------------- MESSAGE ----------------
const chatBox = document.getElementById("chatMessages");
const input = document.getElementById("messageInput");

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

  render(msg, true);
  socket.emit("private_message", msg);
  input.value = "";
}

socket.on("private_message", msg => render(msg, false));

function render(msg, me) {
  const div = document.createElement("div");
  div.className = "message " + (me ? "user" : "helper");
  div.innerHTML = `<b>${me ? "You" : msg.from}</b><br>${msg.text}<span class="time">${msg.time}</span>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ---------------- TYPING ----------------
input.oninput = () => socket.emit("typing", { to: chatWith });
socket.on("typing", d => typingIndicator.innerText = `${d.from} typing...`);
socket.on("stop_typing", () => typingIndicator.innerText = "");

// ---------------- STATUS ----------------
socket.on("status_result", d => {
  if (d.status === "online") {
    statusDot.className = "dot online";
    statusText.innerText = "Online";
  } else {
    statusDot.className = "dot offline";
    statusText.innerText = "Offline";
  }
});
socket.emit("check_status", { email: chatWith });

// ---------------- VOICE MESSAGE ----------------
let recorder, chunks = [];
micBtn.onclick = async () => {
  if (!recorder) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks);
      chunks = [];
      const reader = new FileReader();
      reader.onload = () => {
        socket.emit("voice_message", { to: chatWith, audio: reader.result });
        renderVoice(reader.result, true);
      };
      reader.readAsDataURL(blob);
    };
    recorder.start();
    micBtn.style.background = "red";
  } else {
    recorder.stop();
    recorder = null;
    micBtn.style.background = "";
  }
};

socket.on("voice_message", d => renderVoice(d.audio, false));

function renderVoice(src, me) {
  const div = document.createElement("div");
  div.className = "message " + (me ? "user" : "helper");
  div.innerHTML = `<audio controls src="${src}"></audio>`;
  chatBox.appendChild(div);
}

// ---------------- CALL (BASIC) ----------------
audioCallBtn.onclick = () => socket.emit("call_user", { to: chatWith });
videoCallBtn.onclick = () => socket.emit("call_user", { to: chatWith });

socket.on("incoming_call", () => alert("Incoming Call"));

function endCall() {
  callScreen.style.display = "none";
}
