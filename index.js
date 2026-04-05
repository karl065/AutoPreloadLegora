import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import Sitemapper from 'sitemapper';
const app = express();

const { PORT } = process.env;

const WP_URL = 'https://www.legoraconsulting.com.co/?jacab_cycle=1';
const SITEMAP_URL = 'https://www.legoraconsulting.com.co/sitemap_index.xml';

// 1. Endpoint para UptimeRobot y WordPress
app.get('/keep-alive', (req, res) => {
	console.log('Ping recibido. Render está despierto.');
	res.send('JACAB_RENDER_ALIVE');
});

// 2. Endpoint para iniciar el calentamiento (Warmup)
app.get('/start-warmup', async (req, res) => {
	res.send('Iniciando calentamiento...');
	const sitemapper = new Sitemapper({ url: SITEMAP_URL, timeout: 15000 });

	try {
		const { sites } = await sitemapper.fetch();
		console.log(`Calentando ${sites.length} URLs...`);
		for (const url of sites) {
			try {
				await axios.get(url);
				console.log(`✅ HIT generado: ${url}`);
				await new Promise((resolve) => setTimeout(resolve, 2000)); // Respiro para los 512MB
			} catch (e) {
				console.error(`❌ Error en ${url}`);
			}
		}
	} catch (err) {
		console.error('Error al leer sitemap');
	}
});

// 3. Ciclo de auto-mantenimiento cada 14 min
setInterval(
	async () => {
		const hora = new Date().getUTCHours() - 5; // Hora Colombia
		if (hora >= 4 && hora < 22) {
			try {
				await axios.get(WP_URL);
				console.log('Sincronización con WordPress exitosa.');
			} catch (e) {
				console.log('WordPress no responde o está en modo ahorro.');
			}
		}
	},
	14 * 60 * 1000,
);

app.listen(PORT, () => {
	console.log('servidor corriendo en puerto: ', PORT);
});
