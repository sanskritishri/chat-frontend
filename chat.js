const token = sessionStorage.getItem("token");
const myEmail = sessionStorage.getItem("email");
const chatWith = sessionStorage.getItem("chatWith"); 
// chatWith tum login ke baad set karoge

if (!token || !chatWith) location.href = "login.html";

document.getElementById("chatWith").innerText = chatWith;

const socket = io("https://private-chat-ftj0.onrender.com", {
  auth: { token }
});

const typingDiv = document.getElementById("typingIndicator");
let typingTimeout;

const chatBox = document.getElementById("chatMessages");
const input = document.getElementById("messageInput");
const picker = document.getElementById("reactionPicker");

const sendBtn = document.getElementById("sendBtn");

sendBtn.addEventListener("click", sendMessage);


let selectedMessageId = null;

/* ENTER = SEND */
input.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

input.addEventListener("input", () => {
  socket.emit("typing", { to: chatWith });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("stop_typing", { to: chatWith });
  }, 800);
});

/* SEND MESSAGE */
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
    status: "sent" // sent | delivered | seen
  };

  renderMessage({ ...msg, from: myEmail }, true);
  socket.emit("private_message", msg);
  input.value = "";
}

/* RECEIVE MESSAGE */
socket.on("private_message", msg => {
  renderMessage({ ...msg, status: "delivered" }, false);

  socket.on("voice_message", data => {
  renderVoice(data.audio, false);
});

  // auto seen
  socket.emit("seen", {
    id: msg.id,
    to: msg.from
  });
});

// typing
socket.on("typing", data => {
  typingDiv.style.display = "block";
  typingDiv.innerText = `${data.from} is typing...`;
});

socket.on("stop_typing", () => {
  typingDiv.style.display = "none";
});

socket.on("connect", () => {
  // 🔥 ask server: is chatWith online?
  socket.emit("check_status", { email: chatWith });
});


/* RENDER MESSAGE */
function renderMessage(msg, isMe) {
  const div = document.createElement("div");
  div.className = `message ${isMe ? "user" : "helper"}`;
  div.dataset.id = msg.id;

  div.innerHTML = `
    <div class="text">
      ${isMe ? msg.text : `<b>${msg.from}</b>: ${msg.text}`}
    </div>
    <span class="time">
      ${msg.time} ${isMe ? getTick(msg.status) : ""}
    </span>

    ${isMe ? `
    <div class="actions">
      <button onclick="editMessage(${msg.id})">✏️</button>
      <button onclick="deleteMessage(${msg.id})">🗑️</button>
    </div>` : ""}
  `;


let mediaRecorder;
let audioChunks = [];

const micBtn = document.getElementById("micBtn");


micBtn.addEventListener("click", async () => {
  try {
    // START recording
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

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
    }
    // STOP recording
    else {
      mediaRecorder.stop();
      micBtn.classList.remove("recording");
    }
  } catch (err) {
    alert("Microphone permission denied");
  }
});
  




  // long press → emoji
 // LONG PRESS (MOBILE + DESKTOP)
let pressTimer;

const startPress = () => {
  pressTimer = setTimeout(() => {
    selectedMessageId = msg.id;
    picker.style.display = "block";
  }, 600);
};

const endPress = () => {
  clearTimeout(pressTimer);
};

// Desktop
div.addEventListener("mousedown", startPress);
div.addEventListener("mouseup", endPress);
div.addEventListener("mouseleave", endPress);

// Mobile
div.addEventListener("touchstart", startPress);
div.addEventListener("touchend", endPress);
div.addEventListener("touchcancel", endPress);

/* SEEN */
socket.on("seen", data => {
  const tick = document.querySelector(
    `[data-id='${data.id}'] .time`
  );
  if (tick) tick.innerHTML += " ✔✔";
});

/* EDIT */
function editMessage(id) {
  const newText = prompt("Edit message");
  if (!newText) return;

  const div = document.querySelector(`[data-id='${id}'] .text`);
  if (div) div.innerText = newText;

  socket.emit("edit_message", {
    id,
    to: chatWith,
    text: newText
  });
}

socket.on("edit_message", data => {
  const div = document.querySelector(`[data-id='${data.id}'] .text`);
  if (div) div.innerText = data.text;
});

/* DELETE */
function deleteMessage(id) {
  if (!confirm("Delete message?")) return;

  document.querySelector(`[data-id='${id}']`)?.remove();

  socket.emit("delete_message", {
    id,
    to: chatWith
  });
}

socket.on("delete_message", data => {
  document.querySelector(`[data-id='${data.id}']`)?.remove();
});

  function renderVoice(audioSrc, isMe) {
  const div = document.createElement("div");
  div.className = `message ${isMe ? "user" : "helper"}`;

  div.innerHTML = `
    <audio controls src="${audioSrc}"></audio>
  `;

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

/* EMOJI */
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

/* TICKS */
function getTick(status) {
  if (status === "sent") return "✔";
  if (status === "delivered") return "✔✔";
  if (status === "seen") return "✔✔";
  return "";
}

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

socket.on("status_result", data => {
  if (data.email === chatWith) {
    if (data.status === "online") {
      statusDot.className = "dot online";
      statusText.innerText = "Online";
    } else {
      statusDot.className = "dot offline";
      statusText.innerText = "Offline";
    }
  }
});

socket.on("user_status", data => {
  if (data.email === chatWith) {
    if (data.status === "online") {
      statusDot.className = "dot online";
      statusText.innerText = "Online";
    } else {
      statusDot.className = "dot offline";
      statusText.innerText = "Offline";
    }
  }
});
