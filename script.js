const API = "http://localhost:5001";
let socket = null;

// ---------------- LOGIN ----------------
async function login() {
  const email = document.getElementById("email")?.value;
  const password = document.getElementById("password")?.value;

  const res = await fetch(API + "/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();

  if (data.token) {
    // Token memory me rakho (NOT localStorage)
    window.authToken = data.token;
    window.userEmail = email;

    window.location.href = "chat.html";
  } else {
    document.getElementById("msg").innerText = data.message;
  }
}

// ---------------- SOCKET CONNECT ----------------
io.on("connection", (socket) => {
  const email = socket.user.email;
  onlineUsers[email] = socket.id;

  console.log("User connected:", email);

  socket.on("private_message", (data) => {
    const target = onlineUsers[data.to];
    if (target) {
      io.to(target).emit("private_message", data);
    }
  });

  socket.on("edit_message", (data) => {
    const target = onlineUsers[data.to];
    if (target) {
      io.to(target).emit("edit_message", data);
    }
  });

  socket.on("delete_message", (data) => {
    const target = onlineUsers[data.to];
    if (target) {
      io.to(target).emit("delete_message", data);
    }
  });

  socket.on("reaction", (data) => {
    const target = onlineUsers[data.to];
    if (target) {
      io.to(target).emit("reaction", data);
    }
  });

  socket.on("disconnect", () => {
    delete onlineUsers[email];
  });
});


// ---------------- SEND MESSAGE ----------------
function sendMessage() {
  const to = document.getElementById("to").value;
  const message = document.getElementById("message").value;

  socket.emit("private_message", { to, message });

  const li = document.createElement("li");
  li.innerText = `You: ${message}`;
  document.getElementById("messages").appendChild(li);

  document.getElementById("message").value = "";
}

// Auto connect when chat page loads
if (window.location.pathname.includes("chat.html")) {
  setTimeout(connectSocket, 500);
}
