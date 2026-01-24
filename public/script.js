async function loadTasks() {
    const res = await fetch("/tasks");
    const tasks = await res.json();

    let html = `
    <tr>
        <th>ID</th>
        <th>Start</th>
        <th>Task</th>
        <th>Priority</th>
        <th>Status</th>
        <th>Due</th>
        <th>Days Left</th>
        <th>Progress</th>
        <th>Action</th>
    </tr>`;

    tasks.forEach(t => {
        html += `
        <tr>
            <td>${t.task_id}</td>
            <td>
                <input type="date" id="start-${t.task_id}" value="${t.start_date}" disabled>
            </td>

            <td><input id="name-${t.task_id}" value="${t.task_name}" disabled></td>

            <td>
                <select id="priority-${t.task_id}" disabled>
                    ${["High","Medium","Low"].map(p =>
                        `<option ${p===t.priority?"selected":""}>${p}</option>`
                    ).join("")}
                </select>
            </td>

            <td>
                <select id="status-${t.task_id}" disabled>
                    ${["Not Started","In Progress","Completed"].map(s =>
                        `<option ${s===t.status?"selected":""}>${s}</option>`
                    ).join("")}
                </select>
            </td>

            <td><input type="date" id="due-${t.task_id}" value="${t.due_date}" disabled></td>
            <td>${t.days_left}</td>
            <td>${t.progress}%</td>

            <td>
                <button onclick="edit(${t.task_id})">✏️</button>
                <button onclick="save(${t.task_id})" id="save-${t.task_id}" style="display:none">💾</button>
                <button onclick="removeTask(${t.task_id})">🗑️</button>
            </td>
        </tr>`;
    });

    document.getElementById("taskTable").innerHTML = html;
}

function edit(id) {
    ["name","priority","status","due"].forEach(f =>
        document.getElementById(`${f}-${id}`).disabled = false
    );
    document.getElementById(`save-${id}`).style.display = "inline";
}

async function save(id) {
    await fetch("/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            task_id: id,
            start_date: new Date().toISOString().slice(0,10),
            task_name: document.getElementById(`name-${id}`).value,
            priority: document.getElementById(`priority-${id}`).value,
            status: document.getElementById(`status-${id}`).value,
            due_date: document.getElementById(`due-${id}`).value
        })
    });
    loadTasks();
}

async function addTask() {
    const taskName = document.getElementById("newTask").value;
    const startDate = document.getElementById("newStart").value;
    const priority = document.getElementById("newPriority").value;
    const status = document.getElementById("newStatus").value;
    const dueDate = document.getElementById("newDue").value;

    if (!taskName || !startDate || !dueDate) {
        alert("Please fill Start Date, Task, and Due Date");
        return;
    }

    await fetch("/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            task_id: null,        // 🔥 IMPORTANT: tells backend it's NEW
            start_date: startDate,
            task_name: taskName,
            priority: priority,
            status: status,
            due_date: dueDate
        })
    });

    // Clear inputs
    document.getElementById("newTask").value = "";
    document.getElementById("newStart").value = "";
    document.getElementById("newDue").value = "";

    loadTasks();
}

async function removeTask(id) {
    if (!confirm("Delete this task?")) return;
    await fetch(`/task/${id}`, { method: "DELETE" });
    loadTasks();
}

loadTasks();

