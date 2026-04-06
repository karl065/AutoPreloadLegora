import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import Sitemapper from 'sitemapper';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de URLs
const WP_BASE_URL = 'https://www.legoraconsulting.com.co/';
const SITEMAP_URL = `${WP_BASE_URL}sitemap_index.xml`;

// SEMÁFORO: Evita que se ejecuten dos procesos al mismo tiempo
let isWarmingUp = false;

// 1. Endpoint para UptimeRobot (Mantiene el servicio despierto)
app.get('/keep-alive', (req, res) => {
	console.log('--- [PING] UptimeRobot detectado ---');
	res.send('JACAB_RENDER_ALIVE');
});

// Función Maestra de Calentamiento (Doble Pasada)
async function runWarmup() {
	if (isWarmingUp) {
		console.log('⚠️ Proceso omitido: Ya hay un calentamiento en curso.');
		return;
	}

	isWarmingUp = true;
	console.log('🔍 [INICIO] Extrayendo URLs del Sitemap...');

	const sitemapper = new Sitemapper({
		url: SITEMAP_URL,
		timeout: 30000,
		debug: false,
	});

	try {
		const { sites } = await sitemapper.fetch();

		if (!sites || sites.length === 0) {
			console.error('🚫 ERROR: No se detectaron URLs en el sitemap.');
			return;
		}

		const totalSites = sites.length;
		console.log(`✅ SITEMAP OK: ${totalSites} URLs encontradas.`);

		// --- PASADA 1: GENERACIÓN (MISS -> HIT) ---
		console.log('🚀 [PASADA 1] Generando caché para todas las URLs...');
		for (let i = 0; i < totalSites; i++) {
			const url = sites[i];
			try {
				const separator = url.includes('?') ? '&' : '?';
				// Agregamos jacab_cycle para identificarnos ante WordPress
				await axios.get(`${url}${separator}jacab_cycle=1`, { timeout: 15000 });
				console.log(`[${i + 1}/${totalSites}] 📡 Generando: ${url}`);
				await new Promise((r) => setTimeout(r, 2000)); // Respiro para RAM de 512MB
			} catch (e) {
				console.error(
					`[${i + 1}/${totalSites}] ❌ Error en generación: ${url}`,
				);
			}
		}

		console.log(
			'✅ [PASADA 1] Finalizada. Pausa de 5s para estabilizar LiteSpeed...',
		);
		await new Promise((r) => setTimeout(r, 5000));

		// --- PASADA 2: VERIFICACIÓN (CONFIRMACIÓN DE HIT) ---
		console.log('🚀 [PASADA 2] Verificando estado HIT de las URLs...');
		for (let i = 0; i < totalSites; i++) {
			const url = sites[i];
			try {
				const separator = url.includes('?') ? '&' : '?';
				const res = await axios.get(`${url}${separator}jacab_cycle=1`, {
					timeout: 15000,
				});
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
				console.error(
					`[${i + 1}/${totalSites}] ❌ Error en verificación: ${url}`,
				);
			}
		}
		console.log(`🏁 [FIN] Proceso completado. ${totalSites} URLs procesadas.`);
	} catch (err) {
		console.error('🚫 Error crítico en el proceso de Warmup:', err.message);
	} finally {
		isWarmingUp = false; // Liberamos el semáforo siempre
	}
}

// Endpoint manual para disparar el proceso
app.get('/start-warmup', (req, res) => {
	if (isWarmingUp) return res.send('Ya hay un proceso en curso.');
	res.send('Calentamiento de doble pasada iniciado. Revisa los logs.');
	runWarmup();
});

// 2. CICLO INTELIGENTE CADA 5 MINUTOS (Horario Colombia)
setInterval(
	async () => {
		// Forzamos la hora de Bogotá (UTC-5) para evitar desfases en Render
		const bogotaTime = new Date().toLocaleString('en-US', {
			timeZone: 'America/Bogota',
			hour12: false,
		});
		const hora = parseInt(bogotaTime.split(', ')[1].split(':')[0]);

		if (hora >= 4 && hora < 23) {
			if (isWarmingUp) {
				console.log(
					`--- [${hora}:00] Verificación omitida: Warmup en curso ---`,
				);
				return;
			}

			try {
				console.log(`--- [VERIFICACIÓN ${hora}:00] ---`);
				// El parámetro &ping=1 le indica al PHP que responda rápido
				const response = await axios.get(
					`${WP_BASE_URL}?jacab_cycle=1&ping=1`,
					{ timeout: 10000 },
				);
				const cacheStatus = response.headers['x-litespeed-cache'];

				console.log(`Estado Home: ${cacheStatus || 'MISS'}`);

				if (cacheStatus !== 'hit') {
					console.warn(
						'⚠️ Caché de Home perdida. Iniciando Warmup automático...',
					);
					runWarmup();
				} else {
					console.log('✅ Home estable (HIT). No se requiere acción.');
				}
			} catch (e) {
				console.log(
					'⚠️ Error de conexión con Legora. El servidor podría estar saturado.',
				);
			}
		} else {
			console.log(
				`🌙 Horario de descanso (${hora}:00). Render en modo ahorro.`,
			);
		}
	},
	5 * 60 * 1000,
); // 5 MINUTOS

app.listen(PORT, () => {
	console.log(`Servidor JACAB Tech activo en puerto: ${PORT}`);
	console.log('Configuración: Doble Pasada / Semáforo / Timezone Bogotá');
});
