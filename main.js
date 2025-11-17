/* --------------------------------------------------------------------------
 *  E-Intern Diary — main.js
 *  - Stacked month summary chart (Apple Calendar style)
 *  - iOS-like calendar
 *  - LocalStorage persistence
 * -------------------------------------------------------------------------- */

/* 1) Utilities ------------------------------------------------------------- */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const fmt = (d) =>
  new Date(d).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const monthTitle = (y, m) =>
  new Date(y, m, 1).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
  });

const escapeHtml = (s = "") =>
  s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

const escapeAttr = (s = "") => s.replace(/["'><`]/g, "");

/* toast helper (สร้าง element ให้เองถ้าไม่มีใน HTML) */
function showToast(msg) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

/* image resize เพื่อลดขนาด localStorage */
async function resizeImageFile(file, maxW = 1200, quality = 0.85) {
  const img = await new Promise((res) => {
    const r = new FileReader();
    r.onload = () => {
      const i = new Image();
      i.onload = () => res(i);
      i.src = r.result;
    };
    r.readAsDataURL(file);
  });

  const scale = Math.min(1, maxW / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { name: file.name, dataUrl: canvas.toDataURL("image/jpeg", quality) };
}

/* 2) State ----------------------------------------------------------------- */
const STORE_KEY = "eintern_diary_v1";
let entries = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
let view = new Date(); // calendar month view

const CATEGORY_LABEL = {
  intern: "ฝึกงาน",
  holiday: "วันหยุด",
  study: "ไปเรียน",
};
const CATEGORY_COLOR = {
  intern: "#7dd3fc", // ฟ้า
  holiday: "#fb7185", // แดง
  study: "#a78bfa", // ม่วง
};

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(entries));
}

/* 3) List ------------------------------------------------------------------ */
function displayCategory(c) {
  return CATEGORY_LABEL[c] || "ฝึกงาน";
}

function renderList(filtered) {
  const list = $("#entryList");
  list.innerHTML = "";

  filtered.forEach((e) => {
    const card = document.createElement("article");
    card.className = "entry";

    const imgs = e.photos?.length
      ? `<div class="gallery">${e.photos
          .map(
            (p) =>
              `<img src="${p.dataUrl}" alt="${escapeAttr(e.title)}">`
          )
          .join("")}</div>`
      : "";

    card.innerHTML = `
      <h3>${e.mood || ""} ${escapeHtml(e.title)}</h3>
      <div class="meta">
        <span><strong>วันที่:</strong> ${fmt(e.date)}</span>
        <span><strong>ชั่วโมง:</strong> ${e.hours}</span>
        <span class="tag ${e.category}">${displayCategory(e.category)}</span>
      </div>
      <p>${escapeHtml(e.tasks).replace(/\n/g, "<br>")}</p>
      <div class="tags">
        ${(e.skills || [])
          .map((s) => `<span class="tag">#${escapeHtml(s)}</span>`)
          .join("")}
      </div>
      ${
        e.links?.length
          ? `<div>ลิงก์: ${e.links
              .map(
                (u) =>
                  `<a href="${escapeAttr(u)}" target="_blank">${escapeHtml(
                    u
                  )}</a>`
              )
              .join(" · ")}</div>`
          : ""
      }
      ${imgs}
      <div class="ops">
        <button data-act="edit" data-id="${e.id}">แก้ไข</button>
        <button data-act="del" data-id="${e.id}" class="btn-danger">ลบ</button>
      </div>
    `;

    list.appendChild(card);
  });

  const hrs = filtered.reduce((s, e) => s + Number(e.hours || 0), 0);
  $("#totals").textContent = `${filtered.length} entries · ${hrs} ชม.`;

  $$("#entryList [data-act]").forEach((btn) =>
    btn.addEventListener("click", onListAction)
  );
}

/* 4) Filters + render pipeline -------------------------------------------- */
function getFilteredEntries() {
  const q = $("#filterQ")?.value?.toLowerCase() || "";
  const mood = $("#filterMood")?.value || "";
  const fromV = $("#filterFrom")?.value;
  const toV = $("#filterTo")?.value;
  const from = fromV ? new Date(fromV) : null;
  const to = toV ? new Date(toV) : null;

  return entries
    .filter((e) => {
      const hay = [
        e.title,
        e.tasks,
        (e.skills || []).join(","),
        (e.links || []).join(","),
        e.category,
      ]
        .join(" ")
        .toLowerCase();

      const hitQ = !q || hay.includes(q);
      const hitMood = !mood || e.mood === mood;
      const dt = new Date(e.date);
      const hitFrom = !from || dt >= from;
      const hitTo = !to || dt <= to;
      return hitQ && hitMood && hitFrom && hitTo;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function render() {
  const filtered = getFilteredEntries();
  renderList(filtered);
  buildDashboard();
  buildCalendar();
}

/* 5) Form ------------------------------------------------------------------ */
$("#entryForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();

  const editId = $("#editingId").value;
  const files = [...($("#photos").files || [])];
  const resized = await Promise.all(files.map((f) => resizeImageFile(f)));

  const item = {
    id: editId || crypto.randomUUID(),
    date: $("#date").value,
    title: $("#title").value.trim(),
    hours: Number($("#hours").value || 0),
    mood: $("#mood").value,
    category: $("#category").value,
    tasks: $("#tasks").value.trim(),
    skills: ($("#skills").value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    links: ($("#links").value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    photos:
      files.length > 0
        ? resized
        : editId
        ? entries.find((e) => e.id === editId)?.photos || []
        : [],
  };

  if (!item.date || !item.title) {
    showToast("กรอกวันที่และหัวข้อก่อนนะ");
    return;
  }

  if (editId) {
    const idx = entries.findIndex((e) => e.id === editId);
    if (idx !== -1) entries[idx] = item;
    $("#formMode").textContent = "โหมด: สร้างใหม่";
    $("#cancelEdit").hidden = true;
  } else {
    entries.push(item);
  }

  saveState();
  ev.target.reset();
  $("#editingId").value = "";
  showToast("บันทึกแล้ว");
  render();
});

$("#cancelEdit").addEventListener("click", () => {
  $("#entryForm").reset();
  $("#editingId").value = "";
  $("#formMode").textContent = "โหมด: สร้างใหม่";
  $("#cancelEdit").hidden = true;
});

function onListAction(e) {
  const id = e.currentTarget.dataset.id;
  const act = e.currentTarget.dataset.act;

  if (act === "edit") {
    const it = entries.find((x) => x.id === id);
    if (!it) return;
    $("#date").value = it.date;
    $("#title").value = it.title;
    $("#hours").value = it.hours;
    $("#mood").value = it.mood;
    $("#category").value = it.category;
    $("#tasks").value = it.tasks;
    $("#skills").value = (it.skills || []).join(", ");
    $("#links").value = (it.links || []).join(", ");
    $("#photos").value = "";
    $("#editingId").value = it.id;
    $("#formMode").textContent = "โหมด: แก้ไข";
    $("#cancelEdit").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (act === "del") {
    if (confirm("ลบบันทึก?")) {
      entries = entries.filter((x) => x.id !== id);
      saveState();
      render();
      showToast("ลบแล้ว");
    }
  }
}

/* 6) Filters -------------------------------------------------------------- */
["filterFrom", "filterTo", "filterMood", "filterQ"].forEach((id) => {
  const el = document.getElementById(id);
  el?.addEventListener("input", render);
});
$("#clearFilters")?.addEventListener("click", () => {
  ["filterFrom", "filterTo", "filterMood", "filterQ"].forEach((id) => {
    const el = $("#" + id);
    if (el) el.value = "";
  });
  render();
});

/* 7) Toolbar actions ------------------------------------------------------ */
$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(entries, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "eintern-diary.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#importJson").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data)) {
        entries = data;
        saveState();
        render();
        showToast("นำเข้าแล้ว");
      }
    } catch (_) {
      showToast("ไฟล์ไม่ถูกต้อง");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

$("#printBtn").addEventListener("click", () => window.print());
$("#reportBtn").addEventListener("click", () => window.print()); // ใช้ layout ปัจจุบันเป็น PDF
$("#emailBtn").addEventListener("click", () => composeEmail());

$("#fabAdd").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => $("#title").focus(), 250);
});

$("#resetBtn").addEventListener("click", () => {
  if (confirm("ล้างข้อมูลบันทึกทั้งหมด?")) {
    entries = [];
    saveState();
    render();
    showToast("ล้างแล้ว");
  }
});

/* 8) Dashboard — Stacked Month Chart ------------------------------------- */
function buildDashboard() {
  const canvas = $("#chartTags");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const year = new Date().getFullYear();
  const months = Array.from({ length: 12 }, () => ({
    intern: 0,
    holiday: 0,
    study: 0,
  }));

  entries.forEach((e) => {
    if (!e.date) return;
    const d = new Date(e.date);
    if (d.getFullYear() !== year) return;
    const m = d.getMonth();
    const h = Number(e.hours || 0);
    if (months[m][e.category] != null) {
      months[m][e.category] += h;
    }
  });

  const stacks = months.map((m) => ({
    intern: m.intern || 0,
    holiday: m.holiday || 0,
    study: m.study || 0,
    total: (m.intern || 0) + (m.holiday || 0) + (m.study || 0),
  }));

  const maxTotal = Math.max(1, ...stacks.map((s) => s.total));

  const monthLabels = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];

  const left = 80;
  const right = 20;
  const top = 30;
  const bottom = 26;
  const innerW = W - left - right;
  const innerH = H - top - bottom;

  const rowSpace = innerH / 12;
  const barH = rowSpace * 0.5;

  // background box
  ctx.fillStyle = "#050816";
  ctx.beginPath();
  ctx.roundRect(left - 10, top - 12, innerW + 20, innerH + 24, 14);
  ctx.fill();

  // grid lines
  ctx.strokeStyle = "rgba(148,163,184,0.25)";
  ctx.lineWidth = 1;
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const x = left + (innerW * i) / gridSteps;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + innerH);
    ctx.stroke();
  }

  // labels & bars
  ctx.textBaseline = "middle";
  ctx.font = "12px Poppins";

  stacks.forEach((s, i) => {
    const centerY = top + rowSpace * i + rowSpace / 2;

    // month label
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "right";
    ctx.fillText(monthLabels[i], left - 12, centerY);

    const total = s.total;
    if (total <= 0) return;

    const totalW = (total / maxTotal) * innerW;
    let xStart = left;

    const parts = [
      { key: "intern", color: CATEGORY_COLOR.intern, value: s.intern },
      { key: "holiday", color: CATEGORY_COLOR.holiday, value: s.holiday },
      { key: "study", color: CATEGORY_COLOR.study, value: s.study },
    ];

    parts.forEach((p) => {
      if (p.value <= 0) return;
      const w = totalW * (p.value / total);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.roundRect(xStart, centerY - barH / 2, w, barH, 6);
      ctx.fill();
      xStart += w;
    });

    // numeric label
    ctx.fillStyle = "#e5e7eb";
    ctx.textAlign = "left";
    ctx.fillText(`${total.toFixed(1)} ชม.`, left + totalW + 8, centerY);
  });

  // legend
  const legendItems = [
    { label: "ฝึกงาน", color: CATEGORY_COLOR.intern },
    { label: "วันหยุด", color: CATEGORY_COLOR.holiday },
    { label: "ไปเรียน", color: CATEGORY_COLOR.study },
  ];

  let lx = left;
  const ly = H - 12;
  legendItems.forEach((it) => {
    ctx.fillStyle = it.color;
    ctx.beginPath();
    ctx.roundRect(lx, ly - 6, 18, 8, 4);
    ctx.fill();
    lx += 24;
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "left";
    ctx.fillText(it.label, lx, ly);
    lx += ctx.measureText(it.label).width + 18;
  });
}

/* 9) Calendar (iOS-ish) --------------------------------------------------- */
$("#prevMon").addEventListener("click", () => {
  view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
  buildCalendar();
});
$("#nextMon").addEventListener("click", () => {
  view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
  buildCalendar();
});
$("#todayBtn").addEventListener("click", () => {
  view = new Date();
  buildCalendar();
});

function buildCalendar(targetId = "calendar") {
  const el = document.getElementById(targetId);
  if (!el) return;

  const y = view.getFullYear();
  const m = view.getMonth();

  if (targetId === "calendar") {
    $("#calTitle").textContent = monthTitle(y, m);
  }

  el.innerHTML = "";

  const wds = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
  wds.forEach((w) => {
    const wd = document.createElement("div");
    wd.className = "weekday";
    wd.textContent = w;
    el.appendChild(wd);
  });

  const first = new Date(y, m, 1);
  const days = new Date(y, m + 1, 0).getDate();
  const offset = first.getDay();

  for (let i = 0; i < offset; i++) {
    const blank = document.createElement("div");
    blank.className = "cell";
    blank.style.visibility = "hidden";
    el.appendChild(blank);
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  for (let d = 1; d <= days; d++) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(
      2,
      "0"
    )}`;

    const cell = document.createElement("div");
    cell.className = "cell";

    if (key === todayKey && targetId === "calendar") {
      cell.classList.add("today");
    }

    cell.innerHTML = `<div class="num">${d}</div><div class="pills"></div>`;
    const wrap = cell.querySelector(".pills");

    const dayEntries = entries.filter((e) => e.date === key);
    let more = 0;

    dayEntries.forEach((e, i) => {
      if (i < 2) {
        const pill = document.createElement("div");
        pill.className = `pill ${e.category}`;
        pill.innerHTML = `
          <span class="dot"></span>
          <span>${escapeHtml(e.title)}</span>
        `;
        wrap.appendChild(pill);
      } else {
        more++;
      }
    });

    if (more > 0) {
      const moreEl = document.createElement("div");
      moreEl.className = "more";
      moreEl.textContent = `+${more} รายการ`;
      wrap.appendChild(moreEl);
    }

    if (targetId === "calendar") {
      cell.addEventListener("click", () => {
        $("#filterFrom").value = key;
        $("#filterTo").value = key;
        render();
        $("#date").value = key;
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    el.appendChild(cell);
  }
}

/* 10) Email summary ------------------------------------------------------- */
function composeEmail() {
  const hrs = entries.reduce((s, e) => s + Number(e.hours || 0), 0);
  const body = encodeURIComponent(
    entries
      .map(
        (e) =>
          `${e.date} | ${e.title} (${e.hours} ชม.)\n${e.tasks || ""}`
      )
      .join("\n\n")
  );
  const subj = encodeURIComponent("รายงานบันทึกการฝึกงาน");

  window.location.href =
    `mailto:?subject=${subj}&body=` +
    `สวัสดีค่ะ/ครับ,%0D%0A%0D%0A` +
    `สรุปชั่วโมงรวม ${hrs} ชม.%0D%0A%0D%0A` +
    `${body}%0D%0A%0D%0A`;
}

/* 11) Lightbox ------------------------------------------------------------ */
$("#entryList")?.addEventListener("click", (e) => {
  const img = e.target.closest("img");
  if (!img) return;
  const lb = $("#lightbox");
  lb.style.display = "flex";
  lb.querySelector("img").src = img.src;
});
$(".lb-close")?.addEventListener("click", () => {
  $("#lightbox").style.display = "none";
});

/* 12) Init ---------------------------------------------------------------- */
(function init() {
  render();
})();
