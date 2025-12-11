document.addEventListener("DOMContentLoaded", function () {
  const attendanceForm = document.getElementById("attendanceForm");
  const subjectCountInput = document.getElementById("subjectCount");
  const subjectsContainer = document.getElementById("subjectsContainer");
  const attendanceFormContainer = document.getElementById("attendanceFormContainer");
  const timetableSection = document.getElementById("timetableSection");
  const backendURL = "https://stay75-backend.onrender.com";
  const logoutBtn = document.getElementById("logoutBtn");

  let subjectData = []; // global

  // ------------------ LOGOUT ------------------
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
    subjectData = [];
    window.location.href = "login.html";
  });

  // ------------------ LOAD user data on page load ------------------
  async function loadUserDataFromServer() {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await fetch(`${backendURL}/userdata`, {
        method: "GET",
        headers: { Authorization: token }
      });
      const payload = await res.json();
      if (!res.ok) return;

      const doc = payload.data;
      if (!doc) return;

      const subjects = doc.subjects || [];
      subjectCountInput.value = subjects.length;
      generateSubjectInputs();

      // populate subjectData with existing data
      subjectData = subjects.map(s => ({
        name: s.name || "",
        attended: s.classesAttended ?? s.attended ?? 0,
        total: s.classesConducted ?? s.total ?? 0,
        timetable: s.timetable || []
      }));

      // fill the form inputs
      subjects.forEach((s, i) => {
        document.getElementById(`subjectName${i}`).value = s.name || "";
        document.getElementById(`attended${i}`).value = s.classesAttended ?? s.attended ?? "";
        document.getElementById(`total${i}`).value = s.classesConducted ?? s.total ?? "";
      });

      if (doc.endDate) document.getElementById("endDate").value = new Date(doc.endDate).toISOString().slice(0, 10);
      if (doc.periodsPerDay) document.getElementById("periodsPerDay").value = doc.periodsPerDay;

      attendanceFormContainer.style.display = "none";
      timetableSection.style.display = "block";
      generateTimetable();

      // populate timetable selects
      subjectData.forEach((sub, idx) => {
        (sub.timetable || []).forEach(slot => {
          const selectEl = document.querySelector(`#timetableContainer select[data-day="${slot.day}"][data-period="${slot.period}"]`);
          if (selectEl) selectEl.value = idx;
        });
      });

      attachSubjectInputListeners();
      attachTimetableListeners();

      // show saved leave dates
      if (Array.isArray(doc.safeLeaveDates) && doc.safeLeaveDates.length) {
        showFinalResult({
          finalLeaveDates: doc.safeLeaveDates.map(d => new Date(d).toDateString()),
          safeSubjects: subjectData.filter(s => (s.attended / s.total) * 100 >= 75).map(s => s.name),
          notPossibleSubjects: subjectData.filter(s => (s.attended / s.total) * 100 < 75).map(s => s.name)
        });
      }

    } catch (err) {
      console.error("loadUserDataFromServer error:", err);
    }
  }

  loadUserDataFromServer();

  // ------------------ SAVE user data ------------------
  async function saveUserDataToServer(subjectsArray, finalLeaveDates, endDateInput, periodsPerDayValue) {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      // ensure all subjects have proper fields before saving
      const subjectsForSave = subjectsArray.map(s => ({
        name: s.name || "", // always save name
        classesAttended: Number(s.attended ?? s.classesAttended ?? 0),
        classesConducted: Number(s.total ?? s.classesConducted ?? 0),
        timetable: Array.isArray(s.timetable) ? s.timetable : []
      }));

      const payload = {
        subjects: subjectsForSave,
        safeLeaveDates: finalLeaveDates || [],
        endDate: endDateInput || "",
        periodsPerDay: Number(periodsPerDayValue) || 0
      };

      console.log("Saving to server:", payload); // debug log

      const res = await fetch(`${backendURL}/userdata/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": token },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) console.error("Save failed:", data);
      else console.log("Saved user data:", data);

    } catch (err) {
      console.error("saveUserDataToServer error:", err);
    }
  }

  // ------------------ ATTENDANCE FORM SUBMIT ------------------
  attendanceForm.addEventListener("submit", function (e) {
    e.preventDefault();
    subjectData = [];
    const count = parseInt(subjectCountInput.value);

    for (let i = 0; i < count; i++) {
      const name = document.getElementById(`subjectName${i}`).value.trim();
      const attended = parseInt(document.getElementById(`attended${i}`).value);
      const total = parseInt(document.getElementById(`total${i}`).value);
      if (!name || isNaN(attended) || isNaN(total) || total < attended) return alert("Please enter valid data for all subjects.");
      subjectData.push({ name, attended, total, timetable: [] });
    }

    attendanceFormContainer.style.display = "none";
    timetableSection.style.display = "block";
    generateTimetable();
    attachSubjectInputListeners();
    attachTimetableListeners();

    // auto-save initial data
    saveUserDataToServer(subjectData, [], document.getElementById("endDate").value, document.getElementById("periodsPerDay").value);
  });

  // ------------------ GENERATE SUBJECT INPUTS ------------------
  window.generateSubjectInputs = function () {
    subjectsContainer.innerHTML = "";
    const count = parseInt(subjectCountInput.value);
    for (let i = 0; i < count; i++) {
      const row = document.createElement("div");
      row.classList.add("subject-row");
      row.innerHTML = `
        <input type="text" id="subjectName${i}" placeholder="Subject Name" required />
        <input type="number" id="attended${i}" placeholder="Attended" min="0" required />
        <input type="number" id="total${i}" placeholder="Total" min="0" required />
      `;
      subjectsContainer.appendChild(row);
    }
    attachSubjectInputListeners();
  };

  // ------------------ GENERATE TIMETABLE ------------------
  window.generateTimetable = function () {
    const timetableContainer = document.getElementById("timetableContainer");
    timetableContainer.innerHTML = "";
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const periodsPerDay = parseInt(document.getElementById("periodsPerDay").value);

    const table = document.createElement("table");
    const header = document.createElement("tr");
    header.innerHTML = `<th>Day \\ Period</th>`;
    for (let p = 1; p <= periodsPerDay; p++) header.innerHTML += `<th>Period ${p}</th>`;
    table.appendChild(header);

    days.forEach((day, dayIndex) => {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${day}</td>`;
      for (let p = 0; p < periodsPerDay; p++) {
        const cell = document.createElement("td");
        const select = document.createElement("select");
        select.dataset.day = dayIndex;
        select.dataset.period = p;

        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "-";
        select.appendChild(emptyOption);

        subjectData.forEach((sub, idx) => {
          const option = document.createElement("option");
          option.value = idx;
          option.textContent = sub.name;
          select.appendChild(option);
        });

        cell.appendChild(select);
        row.appendChild(cell);
      }
      table.appendChild(row);
    });

    timetableContainer.appendChild(table);
    attachTimetableListeners();
  };

  // ------------------ ATTACH AUTO-SAVE LISTENERS ------------------
  function attachSubjectInputListeners() {
    const count = parseInt(subjectCountInput.value);
    for (let i = 0; i < count; i++) {
      ["subjectName", "attended", "total"].forEach(field => {
        const el = document.getElementById(`${field}${i}`);
        if (el) {
          el.addEventListener("input", () => {
            subjectData[i].name = document.getElementById(`subjectName${i}`).value.trim();
            subjectData[i].attended = parseInt(document.getElementById(`attended${i}`).value) || 0;
            subjectData[i].total = parseInt(document.getElementById(`total${i}`).value) || 0;
            saveUserDataToServer(subjectData, [], document.getElementById("endDate").value, document.getElementById("periodsPerDay").value);
          });
        }
      });
    }
  }

  function attachTimetableListeners() {
    const timetableSelects = document.querySelectorAll("#timetableContainer select");
    timetableSelects.forEach(select => {
      select.addEventListener("change", () => {
        subjectData.forEach(sub => (sub.timetable = []));
        timetableSelects.forEach(sel => {
          const subjectIndex = parseInt(sel.value);
          if (!isNaN(subjectIndex)) {
            const day = parseInt(sel.dataset.day);
            const period = parseInt(sel.dataset.period);
            subjectData[subjectIndex].timetable.push({ day, period });
          }
        });
        saveUserDataToServer(subjectData, [], document.getElementById("endDate").value, document.getElementById("periodsPerDay").value);
      });
    });
  }

  // ------------------ CALCULATE ------------------
  window.calculate = function () {
    const endDateInput = document.getElementById("endDate").value;
    if (!endDateInput) return alert("Please select an end date.");

    const today = new Date();
    const endDate = new Date(endDateInput);
    if (endDate <= today) return alert("End date must be in the future.");

    const timetableSelects = document.querySelectorAll("#timetableContainer select");
    subjectData.forEach(sub => (sub.timetable = []));
    timetableSelects.forEach(select => {
      const subjectIndex = parseInt(select.value);
      if (!isNaN(subjectIndex)) {
        const day = parseInt(select.dataset.day);
        const period = parseInt(select.dataset.period);
        subjectData[subjectIndex].timetable.push({ day, period });
      }
    });

    const result = processAttendance(subjectData, today, endDate);
    showFinalResult(result);

    // save final result
    saveUserDataToServer(subjectData, result.finalLeaveDates, endDateInput, document.getElementById("periodsPerDay").value);
  };

  // ------------------ PROCESS ATTENDANCE ------------------
  function processAttendance(subjects, today, endDate) {
    const workingDates = [];
    let current = new Date(today);
    current.setDate(current.getDate() + 1);
    while (current <= endDate) {
      const day = current.getDay();
      if (day >= 1 && day <= 5) workingDates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    for (let i = workingDates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [workingDates[i], workingDates[j]] = [workingDates[j], workingDates[i]];
    }

    const selectedDates = [], selectedDateStrings = new Set(), weekLeaveCount = {};
    for (const day of workingDates) {
      const dayStr = day.toDateString();
      const weekKey = `${day.getFullYear()}-${day.getMonth()}-${Math.floor(day.getDate() / 7)}`;
      const prev = new Date(day); prev.setDate(day.getDate() - 1);
      const prev2 = new Date(day); prev2.setDate(day.getDate() - 2);
      if (selectedDateStrings.has(prev.toDateString()) && selectedDateStrings.has(prev2.toDateString())) continue;
      if (weekLeaveCount[weekKey] >= 2) continue;

      const weekday = day.getDay() - 1;
      const tempSubjects = subjects.map(s => {
        const periods = s.timetable.filter(slot => slot.day === weekday).length;
        return { ...s, total: s.total + periods, attended: s.attended };
      });

      if (!tempSubjects.every(s => (s.attended / s.total) * 100 >= 75)) continue;

      selectedDates.push(day);
      selectedDateStrings.add(dayStr);
      weekLeaveCount[weekKey] = (weekLeaveCount[weekKey] || 0) + 1;
    }

    selectedDates.sort((a, b) => a - b);
    const finalLeaveDates = selectedDates.map(d => d.toDateString());
    const safeSubjects = [], notPossibleSubjects = [];

    subjects.forEach(sub => ((sub.attended / sub.total) * 100 >= 75 ? safeSubjects : notPossibleSubjects).push(sub.name));

    return { finalLeaveDates, safeSubjects, notPossibleSubjects };
  }

  // ------------------ SHOW FINAL RESULT ------------------
  function showFinalResult({ finalLeaveDates, safeSubjects, notPossibleSubjects }) {
    document.getElementById("finalResultSection").style.display = "block";
    document.getElementById("leaveDatesSection").innerHTML =
      "<strong>Leave Dates (Common to All Subjects):</strong><br>" + (finalLeaveDates.length ? finalLeaveDates.join("<br>") : "None");
    document.getElementById("safeSubjectsSection").innerHTML =
      "<strong>Safe Subjects:</strong><br>" + (safeSubjects.length ? safeSubjects.join("<br>") : "None");
    document.getElementById("notPossibleSection").innerHTML =
      "<strong>Subjects NOT Safe (Meet Officials):</strong><br>" + (notPossibleSubjects.length ? notPossibleSubjects.join("<br>") : "None");
  }

});
