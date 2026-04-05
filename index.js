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

async function runWarmup() {
	console.log('🔍 Extrayendo URLs del Sitemap...');
	const sitemapper = new Sitemapper({
		url: SITEMAP_URL,
		timeout: 30000, // Aumentamos a 30s por si el sitemap es grande
		debug: false,
	});

	try {
		const { sites } = await sitemapper.fetch();

		if (!sites || sites.length === 0) {
			console.error(
				'🚫 ERROR: No se detectaron URLs. Revisa si el sitemap_index.xml es accesible.',
			);
			return;
		}

		const totalSites = sites.length;
		console.log(
			`✅ SITEMAP DETECTADO: Se encontraron ${totalSites} URLs para procesar.`,
		);

		// --- PASADA 1: GENERACIÓN ---
		console.log('🚀 [PASADA 1] Generando caché para todas las URLs...');
		for (let i = 0; i < totalSites; i++) {
			const url = sites[i];
			try {
				const separator = url.includes('?') ? '&' : '?';
				await axios.get(`${url}${separator}jacab_cycle=1`);
				console.log(`[${i + 1}/${totalSites}] 📡 Generando: ${url}`);
				await new Promise((r) => setTimeout(r, 2000));
			} catch (e) {
				console.error(`[${i + 1}/${totalSites}] ❌ Error generando: ${url}`);
			}
		}

		console.log('✅ [PASADA 1] Finalizada. Pausa de 5s para estabilidad...');
		await new Promise((r) => setTimeout(r, 5000));

		// --- PASADA 2: VERIFICACIÓN ---
		console.log('🚀 [PASADA 2] Verificando estado HIT de las URLs...');
		for (let i = 0; i < totalSites; i++) {
			const url = sites[i];
			try {
				const separator = url.includes('?') ? '&' : '?';
				const res = await axios.get(`${url}${separator}jacab_cycle=1`);
				const status = res.headers['x-litespeed-cache'] || 'MISS/None';

				if (status === 'hit') {
					console.log(`[${i + 1}/${totalSites}] ✅ CONFIRMADO (HIT): ${url}`);
				} else {
					console.warn(
						`[${i + 1}/${totalSites}] ⚠️ REINTENTO (Status: ${status}): ${url}`,
					);
					await axios.get(`${url}${separator}jacab_cycle=1`);
				}
				await new Promise((r) => setTimeout(r, 1000));
			} catch (e) {
				console.error(`[${i + 1}/${totalSites}] ❌ Error verificando: ${url}`);
			}
		}
		console.log(
			`🏁 Proceso completado. Se procesaron ${totalSites} URLs en total.`,
		);
	} catch (err) {
		console.error('🚫 Error crítico al obtener el sitemap:', err.message);
	}
}

app.get('/start-warmup', (req, res) => {
	res.send(
		'Calentamiento de doble pasada iniciado. Revisa los logs para el conteo de URLs.',
	);
	runWarmup();
});

// CICLO CADA 5 MINUTOS
setInterval(
	async () => {
		const hora = new Date().getUTCHours() - 5;
		if (hora >= 4 && hora < 23) {
			try {
				console.log('--- [VERIFICACIÓN 5 MIN] ---');
				const response = await axios.get(`${WP_BASE_URL}?jacab_cycle=1&ping=1`);
				const cacheStatus = response.headers['x-litespeed-cache'];
				console.log(`Estado Home: ${cacheStatus || 'MISS'}`);

				if (cacheStatus !== 'hit') {
					console.warn(
						'⚠️ Caché de Home perdida. Iniciando Warmup completo...',
					);
					runWarmup();
				}
			} catch (e) {
				console.log('⚠️ No se pudo conectar con Legora para verificación.');
			}
		}
	},
	5 * 60 * 1000,
);

app.listen(PORT, () =>
	console.log(`Servidor JACAB Tech activo en puerto: ${PORT}`),
);
