const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");

const app = express();

/* ================== BASIC AUTH ================== */
const USER = process.env.APP_USER;
const PASS = process.env.APP_PASS;

/*
  IMPORTANT:
  - Protects website access
  - Allows frontend API calls without auth headers
*/
app.use((req, res, next) => {
    if (
        req.path.startsWith("/tasks") ||
        req.path.startsWith("/task") ||
        req.path === "/auth-test"
    ) {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader("WWW-Authenticate", "Basic");
        return res.status(401).end();
    }

    const [, base64] = authHeader.split(" ");
    const [user, pass] = Buffer.from(base64, "base64")
        .toString()
        .split(":");

    if (user === USER && pass === PASS) next();
    else {
        res.setHeader("WWW-Authenticate", "Basic");
        res.status(401).end();
    }
});
/* ================================================ */

app.use(bodyParser.json());
app.use(express.static("public"));

/* ================== GOOGLE SHEETS AUTH ================== */
if (!process.env.GOOGLE_PRIVATE_KEY_BASE64) {
    throw new Error("GOOGLE_PRIVATE_KEY_BASE64 is missing");
}

if (!process.env.GOOGLE_CLIENT_EMAIL) {
    throw new Error("GOOGLE_CLIENT_EMAIL is missing");
}

if (!process.env.GOOGLE_SHEET_ID) {
    throw new Error("GOOGLE_SHEET_ID is missing");
}

const privateKey = Buffer
    .from(process.env.GOOGLE_PRIVATE_KEY_BASE64, "base64")
    .toString("utf8");

const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    privateKey,
    [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]
);

const sheets = google.sheets({ version: "v4", auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

/* ================== AUTH TEST ================== */
app.get("/auth-test", async (req, res) => {
    try {
        const token = await auth.getAccessToken();
        res.json({
            success: true,
            tokenReceived: !!token.token,
            clientEmail: process.env.GOOGLE_CLIENT_EMAIL
        });
    } catch (err) {
        console.error("AUTH TEST FAILED:", err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});
/* =============================================== */

/* ================== HELPERS ================== */
function calculateDaysLeft(dueDate) {
    if (!dueDate) return 0;
    const today = new Date();
    const due = new Date(dueDate);
    return Math.ceil((due - today) / 86400000);
}

function calculateProgress(status) {
    if (status === "Completed") return 100;
    if (status === "In Progress") return 50;
    return 0;
}

/* ================== READ TASKS ================== */
async function readTasks() {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: "A:I"
    });

    const rows = response.data.values || [];
    rows.shift(); // remove header

    return rows
        .filter(r => r.length && r[0])
        .map(r => ({
            task_id: Number(r[0]),
            start_date: r[1] || "",
            task_name: r[2] || "",
            priority: r[3] || "",
            status: r[4] || "",
            due_date: r[5] || "",
            days_left: Number(r[6]) || 0,
            progress: Number(r[7]) || 0,
            notes: r[8] || ""
        }));
}

/* ================== ROUTES ================== */

/* GET ALL TASKS */
app.get("/tasks", async (req, res) => {
    try {
        const tasks = await readTasks();
        res.json(tasks);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/* ADD / UPDATE TASK */
app.post("/task", async (req, res) => {
    try {
        const tasks = await readTasks();
        const task = req.body;

        task.status = task.status || "Not Started";
        task.days_left = calculateDaysLeft(task.due_date);
        task.progress = calculateProgress(task.status);
        task.notes = task.notes || "";

        if (task.task_id) {
            // UPDATE EXISTING
            const index = tasks.findIndex(t => t.task_id === Number(task.task_id));
            if (index === -1) return res.sendStatus(404);

            const rowNumber = index + 2;

            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `A${rowNumber}:I${rowNumber}`,
                valueInputOption: "USER_ENTERED",
                requestBody: {
                    values: [[
                        task.task_id,
                        task.start_date,
                        task.task_name,
                        task.priority,
                        task.status,
                        task.due_date,
                        task.days_left,
                        task.progress,
                        task.notes
                    ]]
                }
            });
        } else {
            // ADD NEW
            const newId = tasks.length
                ? Math.max(...tasks.map(t => t.task_id)) + 1
                : 1;

            await sheets.spreadsheets.values.append({
                spreadsheetId: SHEET_ID,
                range: "A:I",
                valueInputOption: "USER_ENTERED",
                insertDataOption: "INSERT_ROWS",
                requestBody: {
                    values: [[
                        newId,
                        task.start_date,
                        task.task_name,
                        task.priority,
                        task.status,
                        task.due_date,
                        task.days_left,
                        task.progress,
                        task.notes
                    ]]
                }
            });
        }

        res.sendStatus(200);
    } catch (err) {
        console.error("SAVE TASK ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

/* DELETE TASK */
app.delete("/task/:id", async (req, res) => {
    try {
        const tasks = await readTasks();
        const index = tasks.findIndex(t => t.task_id === Number(req.params.id));
        if (index === -1) return res.sendStatus(404);

        const rowNumber = index + 2;

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: 0,
                            dimension: "ROWS",
                            startIndex: rowNumber - 1,
                            endIndex: rowNumber
                        }
                    }
                }]
            }
        });

        res.sendStatus(200);
    } catch (err) {
        console.error("DELETE TASK ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});
/* ============================================ */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
    console.log("🚀 Server running (Google Sheets backend)")
);
