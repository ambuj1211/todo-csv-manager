const express = require("express");
const fs = require("fs");
const csv = require("csv-parser");
const bodyParser = require("body-parser");
const simpleGit = require("simple-git");

const app = express();
const CSV_FILE = "./tasks.csv";

/* ================== BASIC AUTH (PERSONAL USE) ================== */
const USER = process.env.APP_USER;
const PASS = process.env.APP_PASS;

const git = simpleGit();

const GIT_USERNAME = process.env.GIT_USERNAME;
const GIT_TOKEN = process.env.GIT_TOKEN;
const GIT_REPO = process.env.GIT_REPO;
const GIT_BRANCH = process.env.GIT_BRANCH || "main";

const GIT_REMOTE = `https://${GIT_USERNAME}:${GIT_TOKEN}@github.com/${GIT_USERNAME}/${GIT_REPO}.git`;

if (!process.env.GIT_TOKEN) {
    throw new Error("GIT_TOKEN missing — data persistence disabled");
}

async function pushCSVToGitHub() {
    try {
        await git.add("tasks.csv");
        await git.commit("Update tasks.csv");
        await git.push(GIT_REMOTE, GIT_BRANCH);
        console.log("✅ tasks.csv pushed to GitHub");
    } catch (err) {
        console.error("❌ GitHub push FAILED");
        console.error(err);
        throw err; // 🔥 DO NOT SILENTLY CONTINUE
    }
}


app.use((req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth) {
        res.setHeader("WWW-Authenticate", "Basic");
        return res.status(401).end();
    }

    const [, base64] = auth.split(" ");
    const [user, pass] = Buffer.from(base64, "base64")
        .toString()
        .split(":");

    if (user === USER && pass === PASS) {
        next();
    } else {
        res.setHeader("WWW-Authenticate", "Basic");
        res.status(401).end();
    }
});
/* =============================================================== */

app.use(bodyParser.json());
app.use(express.static("public"));

/* ================== CSV HELPERS ================== */
function readCSV() {
    return new Promise(resolve => {
        const data = [];
        fs.createReadStream(CSV_FILE)
            .pipe(csv())
            .on("data", row => {
                Object.keys(row).forEach(k => row[k] = row[k].trim());
                data.push(row);
            })
            .on("end", () => resolve(data));
    });
}

function writeCSV(data) {
    if (fs.existsSync(CSV_FILE)) {
        fs.copyFileSync(CSV_FILE, CSV_FILE + ".bak");
    }

    const header =
        "task_id,start_date,task_name,priority,status,due_date,days_left,progress\n";

    const rows = data.map(t =>
        `${t.task_id},${t.start_date},${t.task_name},${t.priority},${t.status},${t.due_date},${t.days_left},${t.progress}`
    ).join("\n");

    const temp = CSV_FILE + ".tmp";
    fs.writeFileSync(temp, header + rows);
    fs.renameSync(temp, CSV_FILE);
    pushCSVToGitHub();   // 🔥 THIS IS THE MAGIC
}

function calculateDaysLeft(dueDate) {
    const today = new Date();
    const due = new Date(dueDate);
    return Math.ceil((due - today) / 86400000);
}

function calculateProgress(status) {
    if (status === "Completed") return 100;
    if (status === "In Progress") return 50;
    return 0;
}
/* ================================================= */

/* ================== ROUTES ================== */
app.get("/tasks", async (req, res) => {
    res.json(await readCSV());
});

app.post("/task", async (req, res) => {
    let tasks = await readCSV();
    let task = req.body;

    task.status = task.status || "Not Started";
    task.days_left = calculateDaysLeft(task.due_date);
    task.progress = calculateProgress(task.status);

    if (task.task_id !== null && task.task_id !== undefined) {
        const idx = tasks.findIndex(t =>
            String(t.task_id) === String(task.task_id)
        );
        if (idx !== -1) tasks[idx] = task;
    } else {
        task.task_id = tasks.length
            ? Math.max(...tasks.map(t => Number(t.task_id))) + 1
            : 1;
        tasks.push(task);
    }

    writeCSV(tasks);
    res.sendStatus(200);
});

app.delete("/task/:id", async (req, res) => {
    const id = String(req.params.id).trim();
    let tasks = await readCSV();

    tasks = tasks.filter(t => String(t.task_id).trim() !== id);
    tasks.forEach((t, i) => t.task_id = i + 1);

    writeCSV(tasks);
    res.sendStatus(200);
});
/* ============================================ */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running"));



