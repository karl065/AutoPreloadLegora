import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import Sitemapper from 'sitemapper';

const app = express();
const PORT = process.env.PORT || 3000;

// URLs de Configuración
const WP_BASE_URL = 'https://www.legoraconsulting.com.co/';
const WP_PING_URL = `${WP_BASE_URL}?jacab_cycle=1&ping=1`;
const SITEMAP_URL = `${WP_BASE_URL}sitemap_index.xml`;

// 1. Endpoint para UptimeRobot (Mantiene a Render despierto)
app.get('/keep-alive', (req, res) => {
	console.log('Ping de UptimeRobot recibido.');
	res.send('JACAB_RENDER_ALIVE');
});

// 2. Endpoint de Calentamiento (Warmup) con Reintentos
app.get('/start-warmup', async (req, res) => {
	res.send('Proceso de precarga iniciado en segundo plano...');

	const sitemapper = new Sitemapper({
		url: SITEMAP_URL,
		timeout: 20000,
		debug: false,
	});

	let sites = [];
	let intentos = 0;
	const maxIntentos = 3;

	while (sites.length === 0 && intentos < maxIntentos) {
		intentos++;
		console.log(`Intento ${intentos}: Obteniendo sitemap...`);
		try {
			const data = await sitemapper.fetch();
			sites = data.sites;
			if (sites.length === 0 && intentos < maxIntentos) {
				await new Promise((resolve) => setTimeout(resolve, 10000));
			}
		} catch (err) {
			console.error(`Error en intento ${intentos}`);
			if (intentos < maxIntentos)
				await new Promise((resolve) => setTimeout(resolve, 10000));
		}
	}

	if (sites.length > 0) {
		console.log(`🚀 Iniciando precarga de ${sites.length} URLs...`);
		for (const url of sites) {
			try {
				// IMPORTANTE: Agregamos el parámetro para que WP sepa que es el Bot
				const separator = url.includes('?') ? '&' : '?';
				const targetUrl = `${url}${separator}jacab_cycle=1`;

				await axios.get(targetUrl);
				console.log(`✅ HIT generado: ${url}`);

				// Respiro de 2.5s para no saturar los 512MB de RAM de Legora
				await new Promise((resolve) => setTimeout(resolve, 2500));
			} catch (e) {
				console.error(`❌ Error en: ${url}`);
			}
		}
		console.log('🏁 Calentamiento finalizado.');
	} else {
		console.error('🚫 No se pudo obtener el sitemap.');
	}
});

// 3. Ciclo de Mantenimiento cada 14 min (Horario Colombia)
setInterval(
	async () => {
		const hora = new Date().getUTCHours() - 5;
		if (hora >= 4 && hora < 23) {
			try {
				// Enviamos el parámetro &ping=1 para que WP responda rápido y haga exit
				await axios.get(WP_PING_URL);
				console.log('Sincronización diaria activa con WordPress.');
			} catch (e) {
				console.log('Esperando que WordPress despierte...');
			}
		}
	},
	14 * 60 * 1000,
);

app.listen(PORT, () => {
	console.log(`Servidor JACAB Tech activo en puerto: ${PORT}`);
});
