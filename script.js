/* =========================================================
   PERFECT NAILS — booking logic

   This site needs TWO free accounts connected before it works:

   1. Firebase (Firestore) — keeps track of which time slots are
      already booked, shared live across every visitor.
   2. EmailJS — emails you when someone books.

   See PUBLISH-INSTRUCTIONS.md for exact setup steps. Then fill
   in the placeholder values below.
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---- 1. FIREBASE CONFIG — replace with your project's config ----
const firebaseConfig = {
  apiKey: "AIzaSyDz0P_M9dyL6HRi8JB7DX2gTtJPv0sbJqA",
  authDomain: "perfect-nails-a74e1.firebaseapp.com",
  projectId: "perfect-nails-a74e1",
  storageBucket: "perfect-nails-a74e1.firebasestorage.app",
  messagingSenderId: "768245449581",
  appId: "1:768245449581:web:849b53O86b1f56cf379O64",
};

// ---- 2. EMAILJS CONFIG — replace with your EmailJS values ----
const EMAILJS_PUBLIC_KEY = "u0MI95gtsDrN2cUEu";
const EMAILJS_SERVICE_ID = "service_adx9i9e";
const EMAILJS_TEMPLATE_ID = "template_uhur6jj";

// ---- 3. YOUR TWO WORKERS — rename these, that's it ----
// worker1 can do BOTH manicures and pedicures.
// worker2 can ONLY do manicures.
const WORKER1 = { id: "worker1", name: "Thao", doesPedis: true };
const WORKER2 = { id: "worker2", name: "Khai", doesPedis: false };

// ---- 4. HOURS — 7:00am to 6:30pm, every 30 minutes ----
const OPEN_MINUTES = 7 * 60; // 7:00am
const CLOSE_MINUTES = 18 * 60 + 30; // 6:30pm
const SLOT_STEP = 30;
const MAX_DAYS_OUT = 60; // customers can book up to 2 months out

// =========================================================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

const form = document.getElementById("booking-form");
const dateInput = document.getElementById("date");
const serviceSelect = document.getElementById("service");
const slotsHint = document.getElementById("slots-hint");
const slotsFieldset = document.getElementById("slots-fieldset");
const slotsGrid = document.getElementById("slots-grid");
const worker1Label = document.getElementById("worker1-label");
const worker2Label = document.getElementById("worker2-label");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("form-status");

worker1Label.textContent = WORKER1.name;
worker2Label.textContent = WORKER2.name;

let selectedSlot = null; // { time: "09:30", worker: "worker1" }
let isConfigured =
  !firebaseConfig.apiKey.startsWith("YOUR_") &&
  !EMAILJS_PUBLIC_KEY.startsWith("YOUR_");

// ---- date picker bounds ----
const today = new Date();
const maxDate = new Date();
maxDate.setDate(today.getDate() + MAX_DAYS_OUT);
dateInput.min = toDateString(today);
dateInput.max = toDateString(maxDate);

function toDateString(d) {
  return d.toISOString().split("T")[0];
}

function generateSlots() {
  const slots = [];
  for (let m = OPEN_MINUTES; m <= CLOSE_MINUTES; m += SLOT_STEP) {
    const hours = Math.floor(m / 60);
    const minutes = m % 60;
    slots.push(
      `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
    );
  }
  return slots;
}

function formatTime12h(time24) {
  const [hourStr, minute] = time24.split(":");
  let hour = Number(hourStr);
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

function currentServiceType() {
  const option = serviceSelect.selectedOptions[0];
  return option ? option.dataset.type : null;
}

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = "form-status" + (type ? " " + type : "");
}

function updateSubmitState() {
  submitBtn.disabled = !selectedSlot;
}

// ---- fetch which (time, worker) pairs are already booked for a date ----
async function fetchBookedSet(dateStr) {
  const slotsCol = collection(db, "slots");
  const q = query(slotsCol, where("date", "==", dateStr));
  const snap = await getDocs(q);
  const booked = new Set();
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    booked.add(`${data.time}_${data.worker}`);
  });
  return booked;
}

async function renderSlots() {
  const dateStr = dateInput.value;
  const serviceType = currentServiceType();
  selectedSlot = null;
  updateSubmitState();

  if (!dateStr || !serviceType) {
    slotsFieldset.classList.add("hidden");
    slotsHint.classList.remove("hidden");
    slotsHint.textContent = "Choose a service and date above to see open times.";
    return;
  }

  if (!isConfigured) {
    slotsFieldset.classList.add("hidden");
    slotsHint.classList.remove("hidden");
    slotsHint.textContent =
      "Booking isn't connected yet — the salon owner needs to finish setup.";
    return;
  }

  slotsHint.classList.remove("hidden");
  slotsHint.textContent = "Loading open times…";
  slotsFieldset.classList.add("hidden");

  let booked;
  try {
    booked = await fetchBookedSet(dateStr);
  } catch (err) {
    console.error("Error loading availability:", err);
    slotsHint.textContent =
      "Couldn't load availability right now. Please refresh and try again.";
    return;
  }

  const slots = generateSlots();
  const workers = [WORKER1, WORKER2];
  let anyAvailable = false;

  slotsGrid.innerHTML = "";

  slots.forEach((time) => {
    const row = document.createElement("div");
    row.className = "slot-row";

    const timeLabel = document.createElement("span");
    timeLabel.className = "slot-time";
    timeLabel.textContent = formatTime12h(time);
    row.appendChild(timeLabel);

    workers.forEach((worker) => {
      const cellWrap = document.createElement("label");
      cellWrap.className = "slot-cell";

      const offered = serviceType !== "pedi" || worker.doesPedis;
      const takenKey = `${time}_${worker.id}`;
      const isTaken = booked.has(takenKey);

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "slot";
      input.value = takenKey;
      input.className = "slot-radio";
      input.disabled = !offered || isTaken;

      const span = document.createElement("span");
      span.className = "slot-pill";

      if (!offered) {
        span.textContent = "—";
        cellWrap.classList.add("not-offered");
      } else if (isTaken) {
        span.textContent = "Booked";
        cellWrap.classList.add("taken");
      } else {
        span.textContent = "Available";
        cellWrap.classList.add("open");
        anyAvailable = true;
      }

      input.addEventListener("change", () => {
        selectedSlot = { time, worker: worker.id };
        updateSubmitState();
      });

      cellWrap.appendChild(input);
      cellWrap.appendChild(span);
      row.appendChild(cellWrap);
    });

    slotsGrid.appendChild(row);
  });

  slotsFieldset.classList.remove("hidden");
  slotsHint.classList.add("hidden");

  if (!anyAvailable) {
    slotsHint.classList.remove("hidden");
    slotsHint.textContent = "Fully booked that day — please try another date.";
  }
}

dateInput.addEventListener("change", renderSlots);
serviceSelect.addEventListener("change", renderSlots);

form.addEventListener("submit", async function (event) {
  event.preventDefault();

  if (!form.checkValidity() || !selectedSlot) {
    form.reportValidity();
    return;
  }

  if (!isConfigured) {
    setStatus(
      "Booking isn't connected yet — the salon owner needs to finish setup.",
      "error"
    );
    return;
  }

  const data = Object.fromEntries(new FormData(form).entries());
  const dateStr = dateInput.value;
  const { time, worker: workerId } = selectedSlot;
  const workerName = workerId === WORKER1.id ? WORKER1.name : WORKER2.name;
  const slotDocId = `${dateStr}_${time}_${workerId}`;

  submitBtn.disabled = true;
  submitBtn.textContent = "Booking…";
  setStatus("", "");

  try {
    // This write only succeeds if the slot doc doesn't already exist —
    // Firestore rules treat writing to an existing doc as an "update",
    // which is blocked. That's what stops two people double-booking
    // the same slot at the same time.
    await setDoc(doc(db, "slots", slotDocId), {
      date: dateStr,
      time,
      worker: workerId,
      service: data.service,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Slot booking error:", err);
    setStatus(
      "Sorry — that time was just booked by someone else. Please pick another.",
      "error"
    );
    submitBtn.disabled = false;
    submitBtn.textContent = "Request appointment";
    renderSlots();
    return;
  }

  try {
    await addDoc(collection(db, "bookings"), {
      name: data.name,
      phone: data.phone,
      service: data.service,
      date: dateStr,
      time,
      worker: workerId,
      workerName,
      notes: data.notes || "",
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Error saving booking details:", err);
    // The slot is already held, so we still try to email the owner below.
  }

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      customer_name: data.name,
      customer_phone: data.phone,
      service: data.service,
      appointment_date: new Date(dateStr + "T00:00:00").toLocaleDateString(
        "en-US",
        { weekday: "long", month: "long", day: "numeric" }
      ),
      appointment_time: formatTime12h(time),
      worker_name: workerName,
      notes: data.notes || "None",
    });
  } catch (err) {
    console.error("EmailJS error:", err);
    setStatus(
      "Your appointment was booked, but we couldn't send the notification email. Please call to confirm.",
      "error"
    );
    submitBtn.disabled = false;
    submitBtn.textContent = "Request appointment";
    return;
  }

  setStatus(
    `You're booked with ${workerName} on ${formatTime12h(time)}. See you then!`,
    "success"
  );
  form.reset();
  selectedSlot = null;
  slotsFieldset.classList.add("hidden");
  slotsHint.classList.remove("hidden");
  slotsHint.textContent = "Choose a service and date above to see open times.";
  submitBtn.disabled = true;
  submitBtn.textContent = "Request appointment";
});
