let scenarios = [];
let draggedId = null;

function save() {
    localStorage.setItem(
        "qa-board",
        JSON.stringify(scenarios)
    );
}

function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatText(str) {
    return escapeHTML(str).replace(/\n/g, "<br>");
}

function getPriorityColor(priority) {
    switch ((priority || "").toLowerCase()) {
        case "alta":
            return "#ef4444";
        case "média":
        case "media":
            return "#f59e0b";
        case "baixa":
            return "#10b981";
        default:
            return "#2563eb";
    }
}

function extractStep(actionCol, expectedCol) {
    actionCol = (actionCol || "").trim();
    expectedCol = (expectedCol || "").trim();

    if (!actionCol && !expectedCol) return null;

    // Se apenas expectedCol foi preenchida
    if (!actionCol && expectedCol) {
        const regex = /(?:^|\n|\r|\|)\s*(?:resultado esperado|expected result)\s*:\s*/i;
        const match = expectedCol.match(regex);
        if (match) {
            const actionPart = expectedCol.substring(0, match.index).trim();
            const expectedPart = expectedCol.substring(match.index + match[0].length).trim();
            return { action: actionPart, expected: expectedPart };
        }
        if (expectedCol.includes("|")) {
            const parts = expectedCol.split("|").map(p => p.trim()).filter(Boolean);
            if (parts.length > 1) {
                return { action: parts[0], expected: parts.slice(1).join(" | ") };
            }
        }
        return { action: "", expected: expectedCol };
    }

    // Se apenas actionCol foi preenchida
    if (actionCol && !expectedCol) {
        const regex = /(?:^|\n|\r|\|)\s*(?:resultado esperado|expected result)\s*:\s*/i;
        const match = actionCol.match(regex);
        if (match) {
            const actionPart = actionCol.substring(0, match.index).trim();
            const expectedPart = actionCol.substring(match.index + match[0].length).trim();
            return { action: actionPart, expected: expectedPart };
        }
        return { action: actionCol, expected: "" };
    }

    // Ambas preenchidas
    return { action: actionCol, expected: expectedCol };
}

function parseCSV(csv) {
    if (!csv) return [];

    // Remove BOM se existir
    if (csv.charCodeAt(0) === 0xFEFF) {
        csv = csv.slice(1);
    }

    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < csv.length; i++) {
        const c = csv[i];
        const next = csv[i + 1];

        if (c === '"') {
            if (quoted && next === '"') {
                field += '"';
                i++;
            } else {
                quoted = !quoted;
            }
            continue;
        }

        if (c === ";" && !quoted) {
            row.push(field);
            field = "";
            continue;
        }

        if ((c === "\n" || c === "\r") && !quoted) {
            if (c === "\r" && next === "\n") {
                i++;
            }
            row.push(field);
            if (row.length && row.some(cell => cell.trim() !== "")) {
                rows.push(row);
            }
            row = [];
            field = "";
            continue;
        }

        field += c;
    }

    if (field || row.length) {
        row.push(field);
        if (row.some(cell => cell.trim() !== "")) {
            rows.push(row);
        }
    }

    if (rows.length === 0) return [];

    // Mapeamento dinâmico de colunas com fallback para as posições padrão do cabeçalho
    // Name;Status;Precondition;Objective;Priority;Test Script;Test Script (Step-by-Step) - Expected Result
    let nameIdx = 0;
    let statusIdx = 1;
    let preIdx = 2;
    let objIdx = 3;
    let priorityIdx = 4;
    let scriptIdx = 5;
    let expectedIdx = 6;

    const headerRow = rows[0];
    const isHeader = headerRow.some(cell => {
        const val = (cell || "").trim().toLowerCase();
        return val === "name" || val === "nome" || val === "test script" || val === "precondition";
    });

    if (isHeader) {
        headerRow.forEach((col, idx) => {
            const h = (col || "").trim().toLowerCase();
            if (h === "name" || h === "nome") nameIdx = idx;
            else if (h === "status") statusIdx = idx;
            else if (h.includes("precondition") || h.includes("pré-condição") || h.includes("pre-condição")) preIdx = idx;
            else if (h.includes("objective") || h.includes("objetivo")) objIdx = idx;
            else if (h === "priority" || h === "prioridade") priorityIdx = idx;
            else if (h === "test script" || h === "script") scriptIdx = idx;
            else if (h.includes("expected result") || h.includes("resultado esperado")) expectedIdx = idx;
        });
    }

    const startIndex = isHeader ? 1 : 0;
    const result = [];
    let current = null;

    for (let i = startIndex; i < rows.length; i++) {
        const c = rows[i];
        const name = (c[nameIdx] || "").trim();

        if (name) {
            current = {
                id: (typeof crypto !== "undefined" && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : 'id_' + Math.random().toString(36).substring(2, 9),
                board: "todo",
                name: name,
                status: (c[statusIdx] || "").trim(),
                pre: (c[preIdx] || "").trim(),
                objective: (c[objIdx] || "").trim(),
                priority: (c[priorityIdx] || "").trim(),
                steps: []
            };

            const step = extractStep(c[scriptIdx], c[expectedIdx]);
            if (step) {
                current.steps.push(step);
            }

            result.push(current);
        } else if (current) {
            const step = extractStep(c[scriptIdx], c[expectedIdx]);
            if (step) {
                current.steps.push(step);
            }
        }
    }

    return result;
}

function render() {
    const search = document.getElementById("search").value.toLowerCase();
    const priority = document.getElementById("priorityFilter").value;

    ["todo", "review", "done"].forEach(col => {
        document.getElementById(col).innerHTML = "";
    });

    scenarios
        .filter(item => {
            const matchText = (item.name || "").toLowerCase().includes(search);
            const matchPriority = !priority || item.priority === priority;
            return matchText && matchPriority;
        })
        .forEach(item => {
            const card = document.createElement("div");
            card.className = "card";
            card.draggable = true;
            card.style.borderLeft = "6px solid " + getPriorityColor(item.priority);

            card.innerHTML = `
                <b>${escapeHTML(item.name)}</b>
                <br><br>
                <span class="badge" style="background:${getPriorityColor(item.priority)}">
                    ${escapeHTML(item.priority || "Sem prioridade")}
                </span>
                <br>
                <small>
                    ${escapeHTML(item.status)} | ${item.steps.length} passos
                </small>
                <br><br>
                <button class="btn" onclick="openScenario('${item.id}')">Abrir</button>
                <button class="btn btn-edit" onclick="editScenario('${item.id}')">Editar</button>
                <button class="btn btn-delete" style="background:#dc2626;" onclick="deleteScenario('${item.id}')">Excluir</button>
            `;

            card.ondragstart = () => {
                draggedId = item.id;
            };

            document.getElementById(item.board).appendChild(card);
        });

    document.getElementById("todoCount").innerText = scenarios.filter(x => x.board === "todo").length;
    document.getElementById("reviewCount").innerText = scenarios.filter(x => x.board === "review").length;
    document.getElementById("doneCount").innerText = scenarios.filter(x => x.board === "done").length;

    document.querySelectorAll(".cards").forEach(col => {
        col.ondragover = e => {
            e.preventDefault();
        };

        col.ondrop = () => {
            const scenario = scenarios.find(s => s.id === draggedId);
            if (!scenario) return;
            scenario.board = col.id;
            save();
            render();
        };
    });
}

function openScenario(id) {
    const s = scenarios.find(x => x.id === id);
    if (!s) return;

    document.getElementById("title").innerText = s.name;

    let html = `
        <p><b>Status:</b> ${escapeHTML(s.status || "-")}</p>
        <p><b>Prioridade:</b> ${escapeHTML(s.priority || "-")}</p>
        <p><b>Objetivo:</b> ${formatText(s.objective || "-")}</p>
        <p><b>Pré-condição:</b> ${formatText(s.pre || "-")}</p>
    `;

    s.steps.forEach((step, index) => {
        html += `
            <hr>
            <h4>Passo ${index + 1}</h4>
            <p>
                <b>Ação:</b><br>
                ${formatText(step.action || "-")}
            </p>
            <p>
                <b>Resultado Esperado:</b><br>
                ${formatText(step.expected || "-")}
            </p>
        `;
    });

    document.getElementById("details").innerHTML = html;
    document.getElementById("modal").style.display = "flex";
}

function closeModal() {
    document.getElementById("modal").style.display = "none";
}

function deleteScenario(id) {
    const scenario = scenarios.find(x => x.id === id);
    if (!scenario) return;

    if (!confirm(`Deseja excluir o cenário:\n\n${scenario.name}?`)) {
        return;
    }

    scenarios = scenarios.filter(x => x.id !== id);
    save();
    render();
}

function editScenario(id) {
    const s = scenarios.find(x => x.id === id);
    if (!s) return;

    document.getElementById("editId").value = s.id;
    document.getElementById("editName").value = s.name;
    document.getElementById("editObjective").value = s.objective;
    document.getElementById("editPre").value = s.pre;
    document.getElementById("editPriority").value = s.priority;

    document.getElementById("editSteps").innerHTML = s.steps.map(
        (step, index) => `
            <hr>
            <h4>Passo ${index + 1}</h4>
            <p>
                <b>Ação:</b><br>
                ${formatText(step.action || "-")}
            </p>
            <p>
                <b>Resultado Esperado:</b><br>
                ${formatText(step.expected || "-")}
            </p>
        `
    ).join("");

    document.getElementById("editModal").style.display = "flex";
}

function closeEditModal() {
    document.getElementById("editModal").style.display = "none";
}

function saveEdit() {
    const id = document.getElementById("editId").value;
    const s = scenarios.find(x => x.id === id);
    if (!s) return;

    s.name = document.getElementById("editName").value;
    s.objective = document.getElementById("editObjective").value;
    s.pre = document.getElementById("editPre").value;
    s.priority = document.getElementById("editPriority").value;

    save();
    closeEditModal();
    render();
}

function clearBoard() {
    if (!confirm("Deseja realmente remover todos os cenários?")) {
        return;
    }
    scenarios = [];
    localStorage.removeItem("qa-board");
    render();
}

function exportJson() {
    const blob = new Blob(
        [JSON.stringify(scenarios, null, 2)],
        { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "qa-review-board.json";
    a.click();
}

function escapeCSV(value) {
    value = value || "";
    value = String(value);
    if (value.includes(";") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
        return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
}

function exportCSV() {
    const lines = [];
    lines.push(
        "Name;Status;Precondition;Objective;Priority;Test Script;Test Script (Step-by-Step) - Expected Result"
    );

    scenarios.forEach(scenario => {
        if (!scenario.steps || scenario.steps.length === 0) {
            lines.push([
                escapeCSV(scenario.name),
                escapeCSV(scenario.status),
                escapeCSV(scenario.pre),
                escapeCSV(scenario.objective),
                escapeCSV(scenario.priority),
                "",
                ""
            ].join(";"));
            return;
        }

        scenario.steps.forEach((step, index) => {
            lines.push([
                index === 0 ? escapeCSV(scenario.name) : "",
                index === 0 ? escapeCSV(scenario.status) : "",
                index === 0 ? escapeCSV(scenario.pre) : "",
                index === 0 ? escapeCSV(scenario.objective) : "",
                index === 0 ? escapeCSV(scenario.priority) : "",
                escapeCSV(step.action),
                escapeCSV(step.expected)
            ].join(";"));
        });
    });

    const blob = new Blob(
        [lines.join("\r\n")],
        { type: "text/csv;charset=utf-8;" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "qa-review-board.csv";
    a.click();
}

function exportAll() {
    exportJson();
    setTimeout(() => exportCSV(), 300);
}

document.getElementById("file").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = result => {
        const content = result.target.result;
        let novos = [];

        if (file.name.endsWith(".json")) {
            try {
                novos = JSON.parse(content);
            } catch (err) {
                console.error("Erro ao ler JSON:", err);
                alert("Erro ao ler arquivo JSON.");
                return;
            }
        } else {
            novos = parseCSV(content);
        }

        const existentes = new Set(
            scenarios.map(s => (s.name || "").trim().toLowerCase())
        );

        let adicionados = 0;
        novos.forEach(novo => {
            const chave = (novo.name || "").trim().toLowerCase();
            if (chave && !existentes.has(chave)) {
                scenarios.push(novo);
                existentes.add(chave);
                adicionados++;
            }
        });

        save();
        render();
        e.target.value = "";
    };

    reader.readAsText(file, "utf-8");
});

document.getElementById("search").addEventListener("input", render);
document.getElementById("priorityFilter").addEventListener("change", render);

const saved = localStorage.getItem("qa-board");
if (saved) {
    try {
        scenarios = JSON.parse(saved);
    } catch (error) {
        console.error(error);
        scenarios = [];
    }
}

render();
