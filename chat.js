const token = sessionStorage.getItem("token");
const myEmail = sessionStorage.getItem("email");
const chatWith = sessionStorage.getItem("chatWith");

if (!token || !chatWith) location.href = "login.html";
document.getElementById("chatWith").innerText = chatWith;

const socket = io("https://private-chat-ftj0.onrender.com", {
  auth: { token }
});

const chatBox = document.getElementById("chatMessages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const picker = document.getElementById("reactionPicker");
const typingDiv = document.getElementById("typingIndicator");

let selectedMessageId = null;

/* ================= SEND MESSAGE ================= */

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
    }),
    status: "sent"
  };

  renderMessage({ ...msg, from: myEmail }, true);
  socket.emit("private_message", msg);
  input.value = "";
}

/* ================= RECEIVE MESSAGE ================= */

socket.on("private_message", msg => {
  renderMessage(msg, false);
  socket.emit("seen", { id: msg.id, to: msg.from });
});

/* ================= RENDER MESSAGE ================= */

function renderMessage(msg, isMe) {
  const div = document.createElement("div");
  div.className = `message ${isMe ? "user" : "helper"}`;
  div.dataset.id = msg.id;

  div.innerHTML = `
    <div class="text">${isMe ? msg.text : `<b>${msg.from}</b>: ${msg.text}`}</div>
    <span class="time">${msg.time}</span>
    ${isMe ? `
      <div class="actions">
        <button onclick="editMessage(${msg.id})">✏️</button>
        <button onclick="deleteMessage(${msg.id})">🗑️</button>
      </div>` : ""}
  `;

  // LONG PRESS (DESKTOP + MOBILE)
  let pressTimer;
  const start = () => {
    pressTimer = setTimeout(() => {
      selectedMessageId = msg.id;
      picker.style.display = "block";
    }, 600);
  };
  const end = () => clearTimeout(pressTimer);

  div.addEventListener("mousedown", start);
  div.addEventListener("mouseup", end);
  div.addEventListener("mouseleave", end);
  div.addEventListener("touchstart", start);
  div.addEventListener("touchend", end);
  div.addEventListener("touchcancel", end);

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

/* ================= MIC (VOICE MESSAGE) ================= */

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
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const reader = new FileReader();

        reader.onloadend = () => {
          socket.emit("voice_message", {
            to: chatWith,
            audio: reader.result
          });
          renderVoice(reader.result, true);
        };

        reader.readAsDataURL(audioBlob);
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

/* ================= VOICE RECEIVE ================= */

socket.on("voice_message", data => {
  renderVoice(data.audio, false);
});

function renderVoice(audioSrc, isMe) {
  const div = document.createElement("div");
  div.className = `message ${isMe ? "user" : "helper"}`;
  div.innerHTML = `<audio controls src="${audioSrc}"></audio>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

/* ================= EMOJI ================= */

function sendReaction(emoji) {
  if (!selectedMessageId) return;

  const div = document.querySelector(`[data-id='${selectedMessageId}']`);
  if (div) div.innerHTML += `<div class="reactions">${emoji}</div>`;

  socket.emit("reaction", {
    id: selectedMessageId,
    to: chatWith,
    emoji
  });

  picker.style.display = "none";
  selectedMessageId = null;
}

socket.on("reaction", data => {
  const div = document.querySelector(`[data-id='${data.id}']`);
  if (div) div.innerHTML += `<div class="reactions">${data.emoji}</div>`;
});

/* ================= EDIT / DELETE ================= */

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
