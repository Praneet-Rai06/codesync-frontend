import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Editor from "@monaco-editor/react";
import "./App.css";

const socket = io(
  "https://codesync-backend-4d0h.onrender.com",
  {
    transports: ["websocket"],
  }
);


/* ================= HELPERS ================= */

const clone = (obj) => structuredClone(obj);

const getNodeByPath = (tree, path) => {
  const parts = path.split("/");
  let current = tree;
  for (let p of parts) {
    current = current[p].children;
  }
  return current;
};

const updateFileByPath = (tree, path, content) => {
  const parts = path.split("/");
  const updated = clone(tree);
  let current = updated;

  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    if (i === parts.length - 1) {
      current[key].content = content;
    } else {
      current = current[key].children;
    }
  }
  return updated;
};

const deleteByPath = (tree, path) => {
  const parts = path.split("/");
  const updated = clone(tree);
  let current = updated;

  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]].children;
  }

  delete current[parts.at(-1)];
  return updated;
};

/* ================= EXPLORER NODE ================= */
function ExplorerNode({
  name,
  node,
  path,
  setFiles,
  setActiveFile,
  setActiveFolder,
  level,
}) {
  const [open, setOpen] = useState(true);
  const isFolder = node.type === "folder";

  return (
    <div>
      <div
        className="explorer-row"
        style={{ paddingLeft: 8 + level * 14 }}
        onClick={() => {
          if (isFolder) {
  setOpen(!open);
  setActiveFolder(path);
}

          else setActiveFile({ path, content: node.content });
        }}
      >
        <span className="explorer-icon">
          {isFolder ? (open ? "▾" : "▸") : " "}
        </span>

        <span className={`explorer-name ${isFolder ? "folder" : ""}`}>
          {name}
        </span>

        <button
          className="explorer-delete"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            if (!window.confirm(`Delete ${name}?`)) return;
            setFiles((prev) => {
  const updated = deleteByPath(prev, path);

  socket.emit("files-update", {
    roomId,
    files: updated,
  });

  return updated;
});
          }}
        >
          🗑
        </button>
      </div>

      {isFolder &&
        open &&
        Object.entries(node.children).map(([child, childNode]) => (
          <ExplorerNode
            key={child}
            name={child}
            node={childNode}
            path={`${path}/${child}`}
            setFiles={setFiles}
            setActiveFile={setActiveFile}
            level={level + 1}
            setActiveFolder={setActiveFolder}
          />
        ))}
    </div>
  );
}

/* ================= MAIN APP ================= */

export default function App() {
  const [roomId, setRoomId] = useState("");
  const [username, setUsername] = useState("");
  const [joined, setJoined] = useState(false);
  const [activeFolder, setActiveFolder] = useState("src");
  const [authMode, setAuthMode] = useState("home");
// home | join | create

  const [files, setFiles] = useState({
    src: {
      type: "folder",
      children: {
        "index.js": {
          type: "file",
          content: "// Welcome to CodeSync 🚀\nconsole.log('Test Running-');",
        },
      },
    },
  });

  const [activeFile, setActiveFile] = useState({
  path: "",
  content: "//Welcome to CodeSync!\n console.log('Test Running-');",
});

  const [users, setUsers] = useState([]);
  const [output, setOutput] = useState("");

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  const [terminalHeight, setTerminalHeight] = useState(200);
  const isDragging = useRef(false);

  /* ================= SOCKETS ================= */
useEffect(() => {
  socket.on("chat-message", (msg) => {
  setMessages((prev) => [...prev, msg]);
});

socket.off("chat-message");

  // ROOM CREATED (OWNER)
  socket.on("room-created", ({ roomId }) => {
    setRoomId(roomId);
    setJoined(true);
  });

  // INITIAL FILES (OWNER + JOINER)
  socket.on("files-init", (files) => {
  setFiles(files);

  const root = Object.keys(files)[0];
  if (!root) return;

  const firstFile = Object.keys(files[root].children)[0];
  if (!firstFile) return;

  setActiveFile({
    path: `${root}/${firstFile}`,
    content: files[root].children[firstFile].content || "",
  });

  setJoined(true); 
});

  

  // FILE UPDATES
  socket.on("files-update", (files) => {
    setFiles(files);

    setActiveFile((prev) => {
      if (!prev.path) return prev;

      const parts = prev.path.split("/");
      let node = files;
      for (let p of parts) node = node[p].children || node[p];

      return { ...prev, content: node.content || "" };
    });
  });

  // USERS LIST
  socket.on("users-update", setUsers);
//chat
 socket.on("chat-message", (msg) => {
    setMessages((prev) => [...prev, msg]);
  });
  // INVALID ROOM
  socket.on("join-rejected", () => {
    alert("❌ Invalid Room ID. Please try again.");
    setRoomId("");
  });

  // CLEANUP
  return () => {
    socket.off("room-created");
    socket.off("files-init");
    socket.off("files-update");
    socket.off("users-update");
    socket.off("chat-message");
    socket.off("join-rejected");
  };
}, []);

  /* ================= TERMINAL DRAG ================= */

  useEffect(() => {
    


    const onMove = (e) => {
      if (!isDragging.current) return;
      const h = window.innerHeight - e.clientY;
      if (h > 120 && h < 400) setTerminalHeight(h);
    };
    const onUp = () => (isDragging.current = false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

 /* ================= JOIN ================= */

const joinRoom = () => {
  if (!roomId || !username) return;
  socket.emit("join-room", { roomId, username });
  
};

/* ================= RUN ================= */
const runCode = () => {
  let filePath = activeFile.path;
  let code = activeFile.content;

  if (!filePath) {
    const root = Object.keys(files)[0];
    if (!root) {
      setOutput("❌ No files found");
      return;
    }

    const firstFile = Object.keys(files[root].children)[0];
    if (!firstFile) {
      setOutput("❌ No files found");
      return;
    }

    filePath = `${root}/${firstFile}`;
    code = files[root].children[firstFile].content || "";

    setActiveFile({
      path: filePath,
      content: code,
    });
  }

  try {
    const logs = [];
    const fakeConsole = {
      log: (...args) => logs.push(args.map(String).join(" ")),
    };

    new Function("console", code)(fakeConsole);

    setOutput(
      logs.length
        ? logs.join("\n")
        : "✔ Executed (no console output)"
    );
  } catch (e) {
    setOutput("❌ " + e.message);
  }
};



  /* ================= JOIN SCREEN ================= */

if (!joined) {
  return (
    <div className="join-page">
      {/* BRAND */}
      <div className="brand">
        <div className="brand-icon">{`</>`}</div>
        <h1>CodeSync</h1>
        <p className="brand-sub">
          Real-time collaborative code editor
        </p>
      </div>

      {/* HOME MODE */}
      {authMode === "home" && (
        <div className="auth-choice">
          <button
            className="primary-btn"
            onClick={() => setAuthMode("create")}
          >
            ➕ Create Room
          </button>

          <button
            className="secondary-btn"
            onClick={() => setAuthMode("join")}
          >
            🔑 Join Room
          </button>
        </div>
      )}

      {/* JOIN MODE */}
      {authMode === "join" && (
        <div className="join-box">
          <h2>Join a Room</h2>

          <label>Your Nickname</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label>Room ID</label>
          <input
            className="input"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />

          <button className="primary-btn" onClick={joinRoom}>
            Join Room
          </button>

          <button
            className="link-btn"
            onClick={() => setAuthMode("home")}
          >
            ← Back
          </button>
        </div>
      )}

      {/* CREATE MODE */}
      {authMode === "create" && (
        <div className="join-box">
          <h2>Create a Room</h2>

          <label>Your Nickname</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <button
            className="primary-btn"
            onClick={() => {
              if (!username.trim()) {
                alert("Enter your nickname");
                return;
              }
              socket.emit("create-room", { username });
            }}
          >
            Create Room
          </button>

          <p className="room-hint">
            A secure Room ID will be generated
          </p>

          <button
            className="link-btn"
            onClick={() => setAuthMode("home")}
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}

/* 🔑 ADD THIS LOADING STATE */
if (!files || Object.keys(files).length === 0) {
  return (
    <div className="loading-screen">
      <div className="spinner" />
      <p>Joining room…</p>
    </div>
  );
}

  /* ================= MAIN UI ================= */

  return (
    <>
      <div className="header">
        <div className="logo">
          <span className="logo-icon">{`</>`}</span>
          CodeSync
        </div>

        <div className="header-center">
  <span className="room-pill">
    {roomId}
  </span>
  <span style={{fontWeight:500, marginLeft: 8, color: "#a96fec" }}>
    | {username}
  </span>
</div>

        <div className="header-right">
          <button onClick={runCode}>▶ Run</button>
          <button onClick={() => window.location.reload()}>Leave</button>
        </div>
      </div>

      <div className="main">
       {/* EXPLORER */}
<div className="left-panel">
  <div className="panel-title explorer-header">
    <span>EXPLORER</span>

    <div className="explorer-header-actions">
     <button
  title="New File"
  onClick={() => {
    const fname = prompt("New file name?");
    if (!fname) return;

   setFiles((prev) => {
  const t = structuredClone(prev);

  getNodeByPath(t, activeFolder)[fname] = {
    type: "file",
    content: "",
  };

  socket.emit("files-update", {
    roomId,
    files: t,
  });

  return t;
});


  }}
>
  +
</button>

<button
  title="New Folder"
  onClick={() => {
    const fname = prompt("New folder name?");
    if (!fname) return;

    setFiles((prev) => {
  const t = structuredClone(prev);

  getNodeByPath(t, activeFolder)[fname] = {
    type: "folder",
    children: {},
  };

  socket.emit("files-update", {
    roomId,
    files: t,
  });

  return t;
});
  }}
>
  📁
</button>

    </div>
  </div>

  {Object.entries(files).map(([name, node]) => (
    <ExplorerNode
      key={name}
      name={name}
      node={node}
      path={name}
      setFiles={setFiles}
      setActiveFile={setActiveFile}
      level={0}
    />
  ))}
</div>

        {/* EDITOR + TERMINAL */}
        <div className="editor-area">
          <div style={{ height: `calc(100% - ${terminalHeight}px)` }}>
            <Editor
              height="100%"
              theme="vs-dark"
              language="javascript"
              value={activeFile.content || ""}

       onChange={(value) => {
  if (!activeFile.path) return;

  setFiles((prev) => {
    const updated = updateFileByPath(prev, activeFile.path, value);

    socket.emit("files-update", {
      roomId,
      files: updated,
    });

    return updated;
  });

  setActiveFile((p) => ({ ...p, content: value }));
}}

              options={{
                minimap: { enabled: false },
                fontSize: 14,
                automaticLayout: true,
              }}
            />
          </div>

         <div
  className="terminal-drag"
  onMouseDown={() => (isDragging.current = true)}
/>

<div className="terminal" style={{ height: terminalHeight }}>
  <div className="terminal-header">
    TERMINAL
  </div>

  <div className="terminal-body">
    <pre>{output}</pre>
  </div>
</div>

        </div>

        {/* USERS + CHAT */}
        <div className="right-panel">
          <div className="users-header">
            <strong>Connected Users</strong>
            <span>{users.length}</span>
          </div>

          {users.map((u) => (
            <div className="user-card" key={u.id}>
              <div className="avatar">{u.name[0].toUpperCase()}</div>
              <div>{u.name}</div>
              <span className="online-dot" />
            </div>
          ))}

          <div className="chat">
            <div className="chat-messages">
              {messages.map((m, i) => (
                <div className="chat-msg" key={i}>
                  <b>{m.user}:</b> {m.text}
                </div>
              ))}
            </div>

            <div className="chat-input">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
              />
              <button
  onClick={() => {
    if (!chatInput.trim()) return;

    socket.emit("chat-message", {
      user: username,
      text: chatInput,
    });

    setChatInput("");
  }}
>
  Send
</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
