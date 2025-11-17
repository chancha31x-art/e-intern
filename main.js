/* --------------------------------------------------------------------------
 * E-Intern Diary — main.js
 * - Dashboard: stacked monthly bar chart (PRO analytics style)
 * - iOS-like calendar view
 * - LocalStorage persistence
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

function showToast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1700);
}

/* Resize image before saving into localStorage */
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
let view = new Date();

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
          ? `<div style="margin-top:4px;font-size:12px">ลิงก์: ${e.links
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

$("#reportBtn").addEventListener("click", () => openReport());
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

/* 8) Dashboard — stacked monthly bar (PRO style) ------------------------- */
let currentPeriod = 30; // default to 30 days

function buildDashboard() {
  const canvas = $("#chartPeriod");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - currentPeriod + 1);

  // Create daily buckets
  const days = [];
  const dayMap = {};
  for (let i = 0; i < currentPeriod; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    dayMap[key] = {
      intern: 0,
      holiday: 0,
      study: 0,
    };
    days.push(key);
  }

  entries.forEach((e) => {
    if (!e.date) return;
    const d = new Date(e.date);
    const key = d.toISOString().slice(0, 10);
    if (dayMap[key]) {
      const h = Number(e.hours || 0);
      if (dayMap[key][e.category] != null) {
        dayMap[key][e.category] += h;
      }
    }
  });

  const stacks = days.map((day) => ({
    day,
    intern: dayMap[day].intern || 0,
    holiday: dayMap[day].holiday || 0,
    study: dayMap[day].study || 0,
    total: (dayMap[day].intern || 0) + (dayMap[day].holiday || 0) + (dayMap[day].study || 0),
  }));

  const maxTotal = Math.max(1, ...stacks.map((s) => s.total));

  // Format labels (date range)
  const dayLabels = days.map((day) => {
    const d = new Date(day + "T00:00:00");
    return d.getDate(); // show day of month
  });

  const left = 52;
  const right = 40;
  const top = 30;
  const bottom = 40;
  const innerW = W - left - right;
  const innerH = H - top - bottom;

  // background panel
  ctx.fillStyle = "#020617";
  roundRect(ctx, left - 12, top - 10, innerW + 24, innerH + 20, 18);
  ctx.fill();

  // horizontal grid
  const gridSteps = 4;
  ctx.strokeStyle = "rgba(148,163,184,0.35)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.font = "11px Poppins";
  ctx.fillStyle = "#9ca3af";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= gridSteps; i++) {
    const ratio = i / gridSteps;
    const y = top + innerH - innerH * ratio;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + innerW, y);
    ctx.stroke();
    const val = (maxTotal * ratio).toFixed(1).replace(/\.0$/, "");
    ctx.fillText(val, left - 6, y);
  }
  ctx.setLineDash([]);

  // bars
  const barCount = stacks.length;
  const slotW = innerW / barCount;
  const barW = Math.max(8, Math.min(slotW * 0.6, 20));

  stacks.forEach((s, i) => {
    const xCenter = left + slotW * i + slotW / 2;
    let yBottom = top + innerH;

    const parts = [
      { key: "intern", color: CATEGORY_COLOR.intern, val: s.intern },
      { key: "holiday", color: CATEGORY_COLOR.holiday, val: s.holiday },
      { key: "study", color: CATEGORY_COLOR.study, val: s.study },
    ];

    parts.forEach((p) => {
      if (p.val <= 0) return;
      const h = innerH * (p.val / maxTotal);
      const y = yBottom - h;
      ctx.fillStyle = p.color;
      roundRect(ctx, xCenter - barW / 2, y, barW, h, 5);
      ctx.fill();
      yBottom = y;
    });

    // total label top of bar (ถ้ามีค่า)
    if (s.total > 0 && barCount <= 30) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "10px Poppins";
      const textY = yBottom - 8;
      ctx.fillText(s.total.toFixed(1).replace(/\.0$/, ""), xCenter, textY);
    }
  });

  // day labels
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#9ca3af";
  ctx.font = "11px Poppins";
  
  // Show every Nth label depending on period
  const labelStep = currentPeriod === 30 ? 3 : currentPeriod === 60 ? 6 : 9;
  dayLabels.forEach((dayNum, i) => {
    if (i % labelStep === 0 || i === dayLabels.length - 1) {
      const xCenter = left + slotW * i + slotW / 2;
      ctx.fillText(dayNum, xCenter, top + innerH + 8);
    }
  });

  // legend bottom-right
  const legendItems = [
    { label: "ฝึกงาน", color: CATEGORY_COLOR.intern },
    { label: "วันหยุด", color: CATEGORY_COLOR.holiday },
    { label: "ไปเรียน", color: CATEGORY_COLOR.study },
  ];
  let lx = left + innerW - 150;
  const ly = top - 14;
  legendItems.forEach((it) => {
    ctx.fillStyle = it.color;
    roundRect(ctx, lx, ly - 6, 18, 8, 4);
    ctx.fill();
    lx += 24;
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "left";
    ctx.font = "11px Poppins";
    ctx.fillText(it.label, lx, ly);
    lx += ctx.measureText(it.label).width + 14;
  });
}

// helper: roundRect for canvas
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/* 9) Calendar (iOS style) ------------------------------------------------- */
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

  // leading blanks
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
    if (key === todayKey && targetId === "calendar") cell.classList.add("today");

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

/* 10) Report Modal (New) --------------------------------------------------- */
function openReport() {
  const y = view.getFullYear();
  const m = view.getMonth();

  // Filter entries for this month
  const monthEntries = entries.filter((e) => {
    const d = new Date(e.date);
    return d.getFullYear() === y && d.getMonth() === m;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  // Calculate stats
  const totalHours = monthEntries.reduce((s, e) => s + Number(e.hours || 0), 0);
  const workDays = new Set(monthEntries.map((e) => e.date)).size;

  const byCategory = { intern: 0, study: 0, holiday: 0 };
  monthEntries.forEach((e) => {
    const cat = e.category || "intern";
    if (byCategory[cat] != null) {
      byCategory[cat] += Number(e.hours || 0);
    }
  });

  // Collect all skills with hours
  const skillMap = {};
  monthEntries.forEach((e) => {
    const h = Number(e.hours || 0);
    (e.skills || []).forEach((s) => {
      skillMap[s] = (skillMap[s] || 0) + h;
    });
  });
  const topSkills = Object.entries(skillMap)
    .map(([name, hours]) => ({ name, hours }))
    .sort((a, b) => b.hours - a.hours);

/* Generate Plain Text Report for PDF Printing */
function generatePlainReport(y, m, monthEntries, totalHours, workDays, byCategory, topSkills) {
  const monthName = monthTitle(y, m);
  
  let plainText = "";
  plainText += "E-Intern Diary — รายงานประจำเดือน\n";
  plainText += "เดือน: " + monthName + "\n";
  plainText += "\n";
  plainText += "สรุปผล\n";
  plainText += "• ชั่วโมงฝึกงานรวม: " + totalHours.toFixed(1) + " ชม.\n";
  plainText += "• วันทำงานทั้งหมด: " + workDays + " วัน\n";
  plainText += "• หมวดงาน:\n";
  plainText += "  ฝึกงาน " + byCategory.intern.toFixed(1) + " ชม.\n";
  plainText += "  ไปเรียน " + byCategory.study.toFixed(1) + " ชม.\n";
  plainText += "  วันหยุด " + byCategory.holiday.toFixed(1) + " ชม.\n";
  plainText += "\n";
  plainText += "กิจกรรมที่ทำ\n";
  
  monthEntries.forEach((e) => {
    const d = new Date(e.date);
    const dayNum = d.getDate();
    const monthAbb = new Date(y, m, 1).toLocaleDateString("th-TH", {
      month: "short",
    });
    plainText += dayNum + " " + monthAbb + ". — " + e.title + "\n";
  });
  
  if (topSkills.length > 0) {
    plainText += "\n";
    plainText += "สรุปทักษะ\n";
    topSkills.forEach((s) => {
      plainText += "• " + s.name + " (" + s.hours.toFixed(1) + " ชม.)\n";
    });
  }
  
  // Set both styled and plain reports
  const plainHtml = `<pre style="font-family:monospace;white-space:pre-wrap;word-wrap:break-word;line-height:1.6;font-size:12px;">${escapeHtml(plainText)}</pre>`;
  $("#plainReport").innerHTML = plainHtml;
}

  // Build report HTML (Plain & Simple for PDF)
  const monthName = monthTitle(y, m);
  const html = `
    <h1 style="font-size:20px;margin:0 0 20px;text-align:center;font-weight:700;">E-Intern Diary — รายงานประจำเดือน</h1>
    
    <p style="text-align:center;color:#666;margin:0 0 24px;"><strong>เดือน:</strong> ${monthName}</p>

    <h2 style="font-size:16px;margin:24px 0 16px;font-weight:700;border-bottom:2px solid #333;padding-bottom:8px;">สรุปผล</h2>
    <ul style="list-style:none;padding:0;margin:0 0 16px;line-height:2;">
      <li>• ชั่วโมงฝึกงานรวม: <strong>${totalHours.toFixed(1)}</strong> ชม.</li>
      <li>• วันทำงานทั้งหมด: <strong>${workDays}</strong> วัน</li>
      <li style="margin-top:12px;"><strong>หมวดงาน:</strong></li>
      <li style="margin-left:20px;">ฝึกงาน ${byCategory.intern.toFixed(1)} ชม.</li>
      <li style="margin-left:20px;">ไปเรียน ${byCategory.study.toFixed(1)} ชม.</li>
      <li style="margin-left:20px;">วันหยุด ${byCategory.holiday.toFixed(1)} ชม.</li>
    </ul>

    <h2 style="font-size:16px;margin:24px 0 16px;font-weight:700;border-bottom:2px solid #333;padding-bottom:8px;">กิจกรรมที่ทำ</h2>
    <ul style="list-style:none;padding:0;margin:0;line-height:1.8;">
      ${monthEntries
        .map((e) => {
          const d = new Date(e.date);
          const dayNum = d.getDate();
          const monthAbb = new Date(y, m, 1).toLocaleDateString("th-TH", {
            month: "short",
          });
          return `<li>${dayNum} ${monthAbb}. — ${escapeHtml(e.title)}</li>`;
        })
        .join("")}
    </ul>

    ${
      topSkills.length > 0
        ? `
    <h2 style="font-size:16px;margin:24px 0 16px;font-weight:700;border-bottom:2px solid #333;padding-bottom:8px;">สรุปทักษะ</h2>
    <ul style="list-style:none;padding:0;margin:0;line-height:1.8;">
      ${topSkills
        .map((s) => `<li>• ${escapeHtml(s.name)} (${s.hours.toFixed(1)} ชม.)</li>`)
        .join("")}
    </ul>
    `
        : ""
    }
  `;

  // Show modal
  const modal = $("#reportModal");
  const body = $("#reportBody");
  body.innerHTML = html;
  modal.removeAttribute("hidden");

  // Setup print button - Generate plain text report
  $("#reportPrintBtn")?.addEventListener("click", () => {
    generatePlainReport(y, m, monthEntries, totalHours, workDays, byCategory, topSkills);
    setTimeout(() => window.print(), 100);
  });
}

/* Close report modal */
$("#reportModal")?.addEventListener("click", (e) => {
  const modal = $("#reportModal");
  if (e.target === modal || e.target.classList.contains("report-overlay")) {
    modal.setAttribute("hidden", "");
  }
});

$(".report-close")?.addEventListener("click", () => {
  $("#reportModal").setAttribute("hidden", "");
});

// Close on Esc key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#reportModal").hasAttribute("hidden")) {
    $("#reportModal").setAttribute("hidden", "");
  }
});

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
  // Setup period button listeners
  $("#period30").addEventListener("click", () => {
    currentPeriod = 30;
    $$(".period-btn").forEach((btn) => btn.classList.remove("active"));
    $("#period30").classList.add("active");
    buildDashboard();
  });
  $("#period60").addEventListener("click", () => {
    currentPeriod = 60;
    $$(".period-btn").forEach((btn) => btn.classList.remove("active"));
    $("#period60").classList.add("active");
    buildDashboard();
  });
  $("#period90").addEventListener("click", () => {
    currentPeriod = 90;
    $$(".period-btn").forEach((btn) => btn.classList.remove("active"));
    $("#period90").classList.add("active");
    buildDashboard();
  });

  render();
})();
