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

// 2. Endpoint para iniciar el calentamiento (Warmup) con Lógica de Reintento
app.get('/start-warmup', async (req, res) => {
	res.send('Iniciando calentamiento...');

	const sitemapper = new Sitemapper({
		url: SITEMAP_URL,
		timeout: 20000, // Aumentamos a 20s por si el servidor está lento
		debug: false,
	});

	let sites = [];
	let intentos = 0;
	const maxIntentos = 3;

	// Bucle para asegurar que el sitemap no venga vacío
	while (sites.length === 0 && intentos < maxIntentos) {
		intentos++;
		console.log(`Intento ${intentos}: Obteniendo URLs del sitemap...`);
		try {
			const data = await sitemapper.fetch();
			sites = data.sites;

			if (sites.length === 0 && intentos < maxIntentos) {
				console.log(
					'⚠️ Sitemap vacío detectado. Reintentando en 10 segundos...',
				);
				await new Promise((resolve) => setTimeout(resolve, 10000));
			}
		} catch (err) {
			console.error('❌ Error al leer sitemap en el intento ' + intentos);
			if (intentos < maxIntentos)
				await new Promise((resolve) => setTimeout(resolve, 10000));
		}
	}

	if (sites.length > 0) {
		console.log(`🚀 Iniciando precarga de ${sites.length} URLs...`);
		for (const url of sites) {
			try {
				// Realizamos la petición para generar el HIT en LiteSpeed
				await axios.get(url);
				console.log(`✅ HIT generado: ${url}`);
				// Respiro de 2.5 segundos para no saturar los 512MB de RAM
				await new Promise((resolve) => setTimeout(resolve, 2500));
			} catch (e) {
				console.error(`❌ Fallo al cargar: ${url}`);
			}
		}
		console.log('🏁 Calentamiento completado con éxito.');
	} else {
		console.error('🚫 No se pudieron obtener URLs tras varios intentos.');
	}
});

// 3. Ciclo de auto-mantenimiento cada 14 min (Horario Colombia)
setInterval(
	async () => {
		const hora = new Date().getUTCHours() - 5;
		if (hora >= 4 && hora < 23) {
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
	console.log('Servidor JACAB Tech corriendo en puerto: ', PORT);
});
