import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import Sitemapper from 'sitemapper';

const app = express();
const PORT = process.env.PORT || 3000;

const WP_BASE_URL = 'https://www.legoraconsulting.com.co/';
const SITEMAP_URL = `${WP_BASE_URL}sitemap_index.xml`;
const UA_UNIVERSAL =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

let isWarmingUp = false;

const myManualHeaders = {
	'User-Agent': UA_UNIVERSAL,
	'X-LS-Guest-Mode': '0',
	'X-LSCACHE': 'on',
	Accept:
		'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
	'Accept-Encoding': 'gzip, deflate, br',
};

app.get('/keep-alive', (req, res) => res.send('JACAB_RENDER_ALIVE'));

async function runWarmup() {
	if (isWarmingUp) return;
	isWarmingUp = true;

	const sitemapper = new Sitemapper({ url: SITEMAP_URL, timeout: 30000 });

	try {
		const { sites } = await sitemapper.fetch();
		if (!sites || sites.length === 0) return;

		const totalSites = sites.length;
		let pendingUrls = []; // Aquí acumulamos los errores

		// --- PASADA 1: GENERACIÓN INICIAL ---
		console.log(`🚀 [PASADA 1] Procesando ${totalSites} URLs...`);
		for (let i = 0; i < totalSites; i++) {
			const url = sites[i];
			try {
				await axios.get(url, { headers: myManualHeaders, timeout: 30000 });
				console.log(
					`[${i + 1}/${totalSites}] 📡 OK: ${url.replace('https://www.', '')}`,
				);
				await new Promise((r) => setTimeout(r, 4000));
			} catch (e) {
				console.error(
					`[${i + 1}/${totalSites}] ❌ FALLO: ${url.replace('https://www.', '')}. Guardado para reintento.`,
				);
				pendingUrls.push(url); // Acumulamos el error
			}
		}

		// --- PASADA 1.5: CORRECCIÓN DE ERRORES ACUMULADOS ---
		let retryCount = 0;
		const maxRetries = 2; // Intentamos limpiar la lista de errores hasta 2 veces

		while (pendingUrls.length > 0 && retryCount < maxRetries) {
			retryCount++;
			console.log(
				`🔄 [PASADA 1.${retryCount}] Reintentando ${pendingUrls.length} errores acumulados...`,
			);

			const urlsToRetry = [...pendingUrls];
			pendingUrls = []; // Vaciamos para capturar nuevos fallos si ocurren

			for (const url of urlsToRetry) {
				try {
					await axios.get(url, { headers: myManualHeaders, timeout: 30000 });
					console.log(`✅ CORREGIDO: ${url.replace('https://www.', '')}`);
					await new Promise((r) => setTimeout(r, 4000));
				} catch (e) {
					console.error(
						`❌ SIGUE FALLANDO: ${url.replace('https://www.', '')}`,
					);
					pendingUrls.push(url); // Vuelve a la lista de errores
				}
			}
		}

		console.log(
			'✅ Generación finalizada. Pausa de 5s antes de verificar HITS...',
		);
		await new Promise((r) => setTimeout(r, 5000));

		// --- PASADA 2: VERIFICACIÓN FINAL ---
		console.log('🚀 [PASADA 2] Verificando estado HIT final...');
		for (let i = 0; i < totalSites; i++) {
			const url = sites[i];
			try {
				const res = await axios.get(url, {
					headers: myManualHeaders,
					timeout: 15000,
				});
				const cacheHeader = res.headers['x-litespeed-cache'];
				console.log(
					`[${i + 1}/${totalSites}] ${cacheHeader === 'hit' ? '🎯 [HIT]' : '⚡ [MISS]'} -> ${url.replace('https://www.', '')}`,
				);
				await new Promise((r) => setTimeout(r, 1000));
			} catch (e) {
				console.error(`❌ Error verificación final: ${url}`);
			}
		}
		console.log('🏁 Proceso JACAB Tech completado.');
	} catch (err) {
		console.error('🚫 Error crítico:', err.message);
	} finally {
		isWarmingUp = false;
	}
}

app.get('/start-warmup', (req, res) => {
	if (isWarmingUp) return res.send('En curso...');
	res.send('Iniciado...');
	runWarmup();
});

// Ciclo de verificación cada 5 minutos
setInterval(
	async () => {
		const bogotaTime = new Date().toLocaleString('en-US', {
			timeZone: 'America/Bogota',
			hour12: false,
		});
		const hora = parseInt(bogotaTime.split(', ')[1].split(':')[0]);

		if (hora >= 4 && hora < 23) {
			if (isWarmingUp) return;
			try {
				const response = await axios.get(WP_BASE_URL, {
					headers: myManualHeaders,
					timeout: 10000,
				});
				if (response.headers['x-litespeed-cache'] !== 'hit') {
					console.warn('⚠️ Home en MISS. Iniciando Warmup...');
					runWarmup();
				}
			} catch (e) {
				console.log('⚠️ Error de conexión.');
			}
		}
	},
	5 * 60 * 1000,
);

app.listen(PORT, () =>
	console.log(`Servidor JACAB Tech activo en puerto: ${PORT}`),
);
