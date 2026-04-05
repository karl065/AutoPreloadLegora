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
	console.log('🚀 Iniciando validación de Sitemap...');
	const sitemapper = new Sitemapper({ url: SITEMAP_URL, timeout: 20000 });
	try {
		const { sites } = await sitemapper.fetch();
		if (sites.length > 0) {
			for (const url of sites) {
				try {
					const separator = url.includes('?') ? '&' : '?';
					await axios.get(`${url}${separator}jacab_cycle=1`);
					console.log(`✅ Cache generada: ${url}`);
					await new Promise((r) => setTimeout(r, 2500));
				} catch (e) {
					console.error(`❌ Error en: ${url}`);
				}
			}
		}
	} catch (err) {
		console.error('🚫 Error al obtener sitemap');
	}
}

app.get('/start-warmup', (req, res) => {
	res.send('Calentamiento iniciado...');
	runWarmup();
});

// CICLO INTELIGENTE: Revisa cada 14 minutos si la Home sigue en HIT
setInterval(
	async () => {
		const hora = new Date().getUTCHours() - 5;
		if (hora >= 4 && hora < 23) {
			try {
				console.log('--- Verificando estado de la caché en Legora ---');
				const response = await axios.get(`${WP_BASE_URL}?jacab_cycle=1&ping=1`);

				// Verificamos el header de LiteSpeed
				const cacheStatus = response.headers['x-litespeed-cache'];
				console.log(`Estado actual: ${cacheStatus || 'No detectado'}`);

				if (cacheStatus !== 'hit') {
					console.warn(
						'⚠️ ALERTA: Caché perdida (MISS). Reiniciando Warmup...',
					);
					runWarmup();
				} else {
					console.log('✅ Todo en orden: La Home sigue en HIT.');
				}
			} catch (e) {
				console.log('Sincronizando... Esperando respuesta de WordPress.');
			}
		}
	},
	14 * 60 * 1000,
);

app.listen(PORT, () =>
	console.log(`Servidor JACAB Tech activo en puerto: ${PORT}`),
);
