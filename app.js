const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const app = express();
const PORT = 3000;

app.use(express.json());

// --- LÓGICA BLOCKCHAIN ---
class Bloque {
    constructor(index, timestamp, datos, usuario, esPublico, hashAnterior = '') {
        this.index = index;
        this.timestamp = timestamp;
        this.datos = datos; // El texto del secreto
        this.usuario = usuario; 
        this.esPublico = esPublico; // true o false
        this.hashAnterior = hashAnterior;
        this.nonce = 0;
        this.hash = this.calcularHash();
    }

    calcularHash() {
        return crypto.createHash('sha256')
            .update(this.index + this.hashAnterior + JSON.stringify(this.datos) + this.usuario + this.esPublico + this.nonce)
            .digest('hex');
    }

    minar(dificultad) {
        while (this.hash.substring(0, dificultad) !== Array(dificultad + 1).join("0")) {
            this.nonce++;
            this.hash = this.calcularHash();
        }
    }
}

// --- BASE DE DATOS JSON ---
const PATH_DB = './usuarios.json';
const PATH_BC = './blockchain.json';

if (!fs.existsSync(PATH_DB)) fs.writeFileSync(PATH_DB, JSON.stringify([]));
if (!fs.existsSync(PATH_BC)) {
    const genesis = new Bloque(0, new Date().toISOString(), "Bienvenido al Blog de Secretos", "Sistema", true, "0");
    fs.writeFileSync(PATH_BC, JSON.stringify([genesis], null, 2));
}

// --- API ---

// Login y Registro
app.post('/api/auth', (req, res) => {
    const { usuario, password, tipo } = req.body;
    let usuarios = JSON.parse(fs.readFileSync(PATH_DB));

    if (tipo === 'registro') {
        if (usuarios.find(u => u.user === usuario)) return res.status(400).send("Usuario ocupado");
        usuarios.push({ user: usuario, pass: password });
        fs.writeFileSync(PATH_DB, JSON.stringify(usuarios, null, 2));
        return res.send("OK");
    } else {
        const u = usuarios.find(u => u.user === usuario && u.pass === password);
        return u ? res.json({ ok: true }) : res.status(401).send("Datos incorrectos");
    }
});

// Obtener Blog (con filtro de privacidad)
app.get('/api/blog', (req, res) => {
    const userLogueado = req.query.user;
    let chain = JSON.parse(fs.readFileSync(PATH_BC));
    
    // Mapeamos la cadena para ocultar secretos ajenos
    const vistaPublica = chain.map(b => {
        const copia = { ...b };
        if (!b.esPublico && b.usuario !== userLogueado) {
            copia.datos = "🔒 [Este secreto es privado]";
        }
        return copia;
    });
    res.json(vistaPublica);
});

// Minar nuevo Post (Solo si está logueado)
app.post('/api/publicar', (req, res) => {
    const { usuario, password, contenido, esPublico } = req.body;
    
    // VALIDACIÓN DE SESIÓN EN SERVIDOR
    const usuarios = JSON.parse(fs.readFileSync(PATH_DB));
    const autor = usuarios.find(u => u.user === usuario && u.pass === password);
    
    if (!autor) return res.status(403).send("No autorizado. Inicia sesión.");

    let chain = JSON.parse(fs.readFileSync(PATH_BC));
    const nuevo = new Bloque(chain.length, new Date().toLocaleString(), contenido, usuario, esPublico, chain[chain.length-1].hash);
    nuevo.minar(2);
    
    chain.push(nuevo);
    fs.writeFileSync(PATH_BC, JSON.stringify(chain, null, 2));
    res.json({ ok: true });
});

// --- FRONTEND ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Secret Blogchain</title>
        <style>
            :root { --p: #6c5ce7; --bg: #f0f2f5; }
            body { font-family: 'Segoe UI', sans-serif; background: var(--bg); margin: 0; display: flex; justify-content: center; }
            .app-container { width: 100%; max-width: 600px; padding: 20px; }
            .card { background: white; padding: 20px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); margin-bottom: 20px; }
            input, textarea { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
            button { background: var(--p); color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; width: 100%; font-weight: bold; }
            .post { border-left: 5px solid var(--p); padding: 15px; margin: 15px 0; background: #fff; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.02); }
            .meta { font-size: 0.75em; color: #888; display: flex; justify-content: space-between; }
            .badge { padding: 2px 8px; border-radius: 10px; font-size: 0.8em; }
            .badge-pub { background: #e3fcef; color: #00b894; }
            .badge-sec { background: #fff0f0; color: #ff7675; }
            #navbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        </style>
    </head>
    <body>
        <div class="app-container">
            <div id="auth-ui" class="card">
                <h2 style="text-align:center; color: var(--p)">🤫 Secret Blogchain</h2>
                <input id="user" placeholder="Tu nombre de usuario">
                <input id="pass" type="password" placeholder="Tu contraseña">
                <div style="display:flex; gap:10px; margin-top:10px;">
                    <button onclick="handleAuth('login')">Entrar</button>
                    <button onclick="handleAuth('registro')" style="background:#a29bfe">Registrar</button>
                </div>
            </div>

            <div id="blog-ui" style="display:none">
                <div id="navbar">
                    <span id="welcome"></span>
                    <button onclick="location.reload()" style="width:auto; padding:5px 10px; background:#ff7675">Salir</button>
                </div>

                <div class="card">
                    <h3>¿Qué quieres confesar hoy?</h3>
                    <textarea id="postContent" placeholder="Escribe tu secreto aquí..."></textarea>
                    <label style="font-size: 0.9em;">
                        <input type="checkbox" id="esPublico" checked style="width:auto"> Hacer este post público
                    </label>
                    <button onclick="publicar()" style="margin-top:10px">✨ Encriptar y Publicar en la Red</button>
                </div>

                <div id="feed"></div>
            </div>
        </div>

        <script>
            let sesion = { user: '', pass: '' };

            async function handleAuth(tipo) {
                const u = document.getElementById('user').value;
                const p = document.getElementById('pass').value;
                const res = await fetch('/api/auth', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ usuario: u, password: p, tipo })
                });
                if(res.ok) {
                    if(tipo === 'login') {
                        sesion = { user: u, pass: p };
                        document.getElementById('auth-ui').style.display='none';
                        document.getElementById('blog-ui').style.display='block';
                        document.getElementById('welcome').innerText = 'Hola, ' + u;
                        cargarFeed();
                    } else alert('Cuenta creada, ya puedes entrar.');
                } else alert('Error en los datos');
            }

            async function publicar() {
                const contenido = document.getElementById('postContent').value;
                const esPublico = document.getElementById('esPublico').checked;
                if(!contenido) return;

                const res = await fetch('/api/publicar', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ ...sesion, contenido, esPublico })
                });
                
                if(res.ok) {
                    document.getElementById('postContent').value = '';
                    cargarFeed();
                }
            }

            async function cargarFeed() {
                const res = await fetch('/api/blog?user=' + sesion.user);
                const posts = await res.json();
                const feed = document.getElementById('feed');
                feed.innerHTML = '<h4>Muro de Confesiones</h4>';
                
                // Los mostramos en orden inverso (más nuevos primero)
                posts.reverse().forEach(p => {
                    const tipo = p.esPublico ? '<span class="badge badge-pub">Público</span>' : '<span class="badge badge-sec">Privado</span>';
                    feed.innerHTML += \`
                        <div class="post">
                            <div class="meta">
                                <span><b>@\${p.usuario}</b> \${tipo}</span>
                                <span>\${p.timestamp}</span>
                            </div>
                            <p style="margin: 15px 0">\${p.datos}</p>
                            <div class="meta" style="border-top: 1px solid #eee; padding-top: 5px;">
                                <small>Hash: \${p.hash.substring(0,16)}...</small>
                            </div>
                        </div>
                    \`;
                });
            }
        </script>
    </body>
    </html>
    `);
});

app.listen(PORT, () => console.log("Blog de Secretos en http://localhost:" + PORT));