import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import Sitemapper from 'sitemapper';

const app = express();
const PORT = process.env.PORT || 3000;

const WP_BASE_URL = 'https://www.legoraconsulting.com.co/';
const SITEMAP_URL = `${WP_BASE_URL}sitemap_index.xml`;

app.get('/keep-alive', (req, res) => {
	console.log('Ping de UptimeRobot recibido.');
	res.send('JACAB_RENDER_ALIVE');
});

// Función Maestra de Calentamiento y Verificación
async function runWarmup() {
	console.log('🚀 [PASADA 1] Iniciando generación de Caché (MISS -> HIT)...');
	const sitemapper = new Sitemapper({ url: SITEMAP_URL, timeout: 20000 });

	try {
		const { sites } = await sitemapper.fetch();
		if (!sites || sites.length === 0) {
			console.error('🚫 No se encontraron URLs en el sitemap.');
			return;
		}

		// FASE 1: Generación
		for (const url of sites) {
			try {
				const separator = url.includes('?') ? '&' : '?';
				await axios.get(`${url}${separator}jacab_cycle=1`);
				console.log(`📡 Generando: ${url}`);
				await new Promise((r) => setTimeout(r, 2000)); // Delay para no saturar 512MB
			} catch (e) {
				console.error(`❌ Error generando: ${url}`);
			}
		}

		console.log(
			'✅ [PASADA 1] Finalizada. Iniciando [PASADA 2] de Verificación...',
		);
		await new Promise((r) => setTimeout(r, 5000)); // Pausa de 5s entre pasadas

		// FASE 2: Verificación de HIT
		for (const url of sites) {
			try {
				const separator = url.includes('?') ? '&' : '?';
				const res = await axios.get(`${url}${separator}jacab_cycle=1`);
				const status = res.headers['x-litespeed-cache'] || 'Desconocido';

				if (status === 'hit') {
					console.log(`✅ CONFIRMADO (HIT): ${url}`);
				} else {
					console.warn(`⚠️ REINTENTO (Sigue en MISS): ${url}`);
					// Si sigue en miss, le damos un toque extra
					await axios.get(`${url}${separator}jacab_cycle=1`);
				}
				await new Promise((r) => setTimeout(r, 1000));
			} catch (e) {
				console.error(`❌ Error verificando: ${url}`);
			}
		}
		console.log('🏁 Proceso de Doble Verificación completado.');
	} catch (err) {
		console.error('🚫 Error crítico en el proceso de Warmup.');
	}
}

app.get('/start-warmup', (req, res) => {
	res.send('Calentamiento de doble pasada iniciado...');
	runWarmup();
});

// CICLO INTELIGENTE CADA 5 MINUTOS
setInterval(
	async () => {
		const hora = new Date().getUTCHours() - 5; // Hora Colombia
		if (hora >= 4 && hora < 23) {
			try {
				console.log('--- [5 MIN] Verificando estado de la Home ---');
				const response = await axios.get(`${WP_BASE_URL}?jacab_cycle=1&ping=1`);
				const cacheStatus = response.headers['x-litespeed-cache'];

				console.log(`Estado: ${cacheStatus || 'No detectado'}`);

				if (cacheStatus !== 'hit') {
					console.warn('⚠️ ALERTA: Caché perdida. Iniciando Doble Pasada...');
					runWarmup();
				} else {
					console.log('✅ Home estable. No se requiere Warmup.');
				}
			} catch (e) {
				console.log('Reintentando conexión con Legora...');
			}
		}
	},
	5 * 60 * 1000,
); // 5 MINUTOS

app.listen(PORT, () =>
	console.log(`Servidor JACAB Tech activo en puerto: ${PORT}`),
);
