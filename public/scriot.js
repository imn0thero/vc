// script.js
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const peer = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});

let socket = new WebSocket(`ws://${location.host}`);

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localVideo.srcObject = stream;
  stream.getTracks().forEach(track => peer.addTrack(track, stream));
}).catch(err => {
  alert("Gagal akses kamera/mikrofon: " + err.message);
});

peer.ontrack = (event) => {
  remoteVideo.srcObject = event.streams[0];
};

peer.onicecandidate = (event) => {
  if (event.candidate) {
    socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
  }
};

socket.onmessage = async (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case "offer":
      await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.send(JSON.stringify({ type: "answer", answer }));
      break;

    case "answer":
      await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
      break;

    case "candidate":
      await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
      break;
  }
};

async function startCall() {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  socket.send(JSON.stringify({ type: "offer", offer }));
}
// script.js
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const peer = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});

let socket = new WebSocket(`ws://${location.host}`);

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localVideo.srcObject = stream;
  stream.getTracks().forEach(track => peer.addTrack(track, stream));
}).catch(err => {
  alert("Gagal akses kamera/mikrofon: " + err.message);
});

peer.ontrack = (event) => {
  remoteVideo.srcObject = event.streams[0];
};

peer.onicecandidate = (event) => {
  if (event.candidate) {
    socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
  }
};

socket.onmessage = async (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case "offer":
      await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.send(JSON.stringify({ type: "answer", answer }));
      break;

    case "answer":
      await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
      break;

    case "candidate":
      await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
      break;
  }
};

async function startCall() {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  socket.send(JSON.stringify({ type: "offer", offer }));
}
