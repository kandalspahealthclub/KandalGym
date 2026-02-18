const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Carregar dados iniciais ou do ficheiro
const loadState = () => {
    if (fs.existsSync(DATA_FILE)) {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
    return null; // Caso não exista, o frontend enviará o mockState inicial
};

const saveState = (state) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
};

// Endpoint para buscar o estado
app.get('/api/state', (req, res) => {
    const state = loadState();
    if (state) {
        res.json(state);
    } else {
        res.status(404).json({ error: 'No state found' });
    }
});

// Endpoint para guardar o estado
app.post('/api/state', (req, res) => {
    saveState(req.body);
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`-------------------------------------------------`);
    console.log(`Sincronizador KandalGym Ativo!`);
    console.log(`No seu telemóvel, aceda a: http://SEU-IP-VAI-AQUI:${PORT}`);
    console.log(`-------------------------------------------------`);
});
