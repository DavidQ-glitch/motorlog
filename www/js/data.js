/* Catálogos: tipos de vehículo (miniaturas), categorías de service (iconos), marcas y modelos */

// Íconos de vehículos: estilo plano moderno (carrocería con el color del tema, vidrios claros, ruedas oscuras, luces)
const INK = '#0f172a', GLASS = '<g fill="#fff" fill-opacity=".88">', GEND = '</g>';
function wheel(cx, cy, r) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${INK}" stroke="#fff" stroke-width="2.4"/>` +
         `<circle cx="${cx}" cy="${cy}" r="${(r * 0.52).toFixed(1)}" fill="#cbd5e1"/>` +
         `<circle cx="${cx}" cy="${cy}" r="${(r * 0.2).toFixed(1)}" fill="${INK}"/>`;
}
const shadow = (rx = 48) => `<ellipse cx="60" cy="57" rx="${rx}" ry="2.4" fill="${INK}" fill-opacity=".13"/>`;
const head = (x, y, w = 4, h = 3) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.4" fill="#fbbf24"/>`;
const tail = (x, y, w = 3, h = 3) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.2" fill="#ef4444"/>`;
const SVG_OPEN = '<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg">';

const VEHICLE_TYPES = [
  { id: 'auto', label: 'Auto',
    body: `${shadow()}
      <path d="M6 43v-8q0-5 6-6l16-3 9-10q3-3 8-3h27q6 0 10 4l9 9 14 3q6 1 6 6v8z" fill="currentColor"/>
      ${GLASS}<path d="M37 26l7-9q2-2 5-2h10v11zM63 15h10q3 0 5 2l8 9H63z"/>${GEND}
      <path d="M6 37h108" stroke="${INK}" stroke-opacity=".12" stroke-width="2"/>
      ${head(107, 33)}${tail(6, 33)}
      ${wheel(32, 44, 10)}${wheel(88, 44, 10)}` },
  { id: 'convertible', label: 'Convertible',
    body: `${shadow()}
      <path d="M6 43v-8q0-5 6-6l22-3h38l11-2 12 5 15 3q6 1 6 6v4z" fill="currentColor"/>
      <path d="M34 26h38l-2 5H38z" fill="${INK}" fill-opacity=".4"/>
      <rect x="40" y="15" width="7" height="13" rx="3.4" fill="${INK}" fill-opacity=".55"/>
      <rect x="53" y="15" width="7" height="13" rx="3.4" fill="${INK}" fill-opacity=".55"/>
      ${GLASS}<path d="M73 27l9-12q1-1 3-1h2l-4 13z"/>${GEND}
      <path d="M6 38h108" stroke="${INK}" stroke-opacity=".12" stroke-width="2"/>
      ${head(108, 33)}${tail(6, 33)}
      ${wheel(32, 44, 10)}${wheel(88, 44, 10)}` },
  { id: 'suv', label: 'SUV / 4x4',
    body: `${shadow(50)}
      <path d="M5 45V29q0-4 4-5l11-2 7-10q2-3 6-3h56q4 0 6 3l7 10 10 3q5 1 5 6v14z" fill="currentColor"/>
      <path d="M33 9h54" stroke="${INK}" stroke-opacity=".45" stroke-width="2.6" stroke-linecap="round"/>
      ${GLASS}<path d="M29 22l5-9h21v9zM59 13h29l6 9H59z"/>${GEND}
      <path d="M5 39h110" stroke="${INK}" stroke-opacity=".12" stroke-width="2"/>
      ${head(112, 31, 3, 4)}${tail(5, 31, 3, 4)}
      ${wheel(30, 46, 12.5)}${wheel(90, 46, 12.5)}` },
  { id: 'pickup', label: 'Pickup',
    body: `${shadow(50)}
      <path d="M5 44V33q0-4 5-5l21-3 9-11q2-3 6-3h20q4 0 6 3l8 11h2v4h30v15z" fill="currentColor"/>
      <path d="M82 28h30" stroke="${INK}" stroke-opacity=".3" stroke-width="2.4" stroke-linecap="round"/>
      ${GLASS}<path d="M38 24l6-9h13v9zM61 15h8q2 0 3 2l6 7H61z"/>${GEND}
      <path d="M5 39h110" stroke="${INK}" stroke-opacity=".12" stroke-width="2"/>
      ${head(113, 34, 2.5, 4)}${tail(5, 32, 3, 4)}
      ${wheel(30, 45, 11)}${wheel(94, 45, 11)}` },
  { id: 'moto', label: 'Moto',
    body: `${shadow(46)}
      <path d="M26 45l19-15M71 34l20 11" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" fill="none"/>
      <path d="M45 25q11-9 25-3l5 8H47z" fill="currentColor"/>
      <path d="M27 27h17l-2 5H26z" fill="${INK}" fill-opacity=".75"/>
      <rect x="49" y="31" width="22" height="10" rx="3" fill="${INK}" fill-opacity=".8"/>
      <path d="M46 43h27" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>
      <path d="M82 22l10 23" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M78 20h11" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
      <path d="M86 26a5 5 0 0110 0z" fill="#fbbf24"/>
      ${wheel(26, 45, 12.5)}${wheel(94, 45, 12.5)}` },
  { id: 'van', label: 'Utilitario',
    body: `${shadow()}
      <path d="M5 45V16q0-5 5-5h71q4 0 7 3l14 12 7 3q5 1 5 6v10z" fill="currentColor"/>
      ${GLASS}<path d="M12 17h28v13H12zM45 17h32v13H45zM82 17l12 13H82z"/>${GEND}
      <path d="M43 15v28" stroke="${INK}" stroke-opacity=".22" stroke-width="2"/>
      <path d="M5 38h110" stroke="${INK}" stroke-opacity=".12" stroke-width="2"/>
      ${head(112, 35, 3, 4)}${tail(5, 33, 3, 4)}
      ${wheel(28, 46, 10.5)}${wheel(92, 46, 10.5)}` },
  { id: 'camion', label: 'Camión',
    body: `${shadow(52)}
      <path d="M5 45V9q0-2 2-2h48q2 0 2 2v36z" fill="currentColor" fill-opacity=".72"/>
      <path d="M5 37h52" stroke="${INK}" stroke-opacity=".2" stroke-width="2.4"/>
      <path d="M59 45V21q0-5 5-5h19l12 14 14 2q4 1 4 5v8z" fill="currentColor"/>
      ${GLASS}<path d="M66 22v9h22l-8-9z"/>${GEND}
      ${head(114, 36, 2.5, 4)}${tail(5, 40, 3, 3)}
      ${wheel(20, 46, 9.5)}${wheel(72, 46, 9.5)}${wheel(98, 46, 9.5)}` },
];
function typeSvg(id) {
  const t = VEHICLE_TYPES.find(x => x.id === id) || VEHICLE_TYPES[0];
  return SVG_OPEN + t.body + '</svg>';
}

// km = intervalo típico (0 = no aplica), meses = intervalo típico en meses (0 = no aplica)
const CATEGORIES = [
  { id: 'aceite', icon: '🛢️', label: 'Aceite y Filtros', km: 10000, meses: 12, kw: ['aceite', 'filtro de aceite', 'filtros'] },
  { id: 'frenos', icon: '🛑', label: 'Frenos', km: 20000, meses: 24, kw: ['freno', 'pastilla', 'disco', 'zapata'] },
  { id: 'distribucion', icon: '⚙️', label: 'Distribución', km: 60000, meses: 48, kw: ['distribuci', 'correa', 'poly-v', 'tensor'] },
  { id: 'neumaticos', icon: '🛞', label: 'Neumáticos', km: 40000, meses: 36, kw: ['neum', 'cubierta', 'rueda', 'llanta'] },
  { id: 'alineacion', icon: '🎯', label: 'Alineación y Balanceo', km: 10000, meses: 12, kw: ['aline', 'balanceo', 'rotaci'] },
  { id: 'bateria', icon: '🔋', label: 'Batería', km: 0, meses: 36, kw: ['bater', 'acumulador'] },
  { id: 'suspension', icon: '🔩', label: 'Suspensión / Dirección', km: 40000, meses: 0, kw: ['suspens', 'amortigu', 'rotula', 'rótula', 'bieleta', 'direcci', 'extremo', 'lift'] },
  { id: 'refrigeracion', icon: '🌡️', label: 'Refrigeración', km: 40000, meses: 24, kw: ['refriger', 'radiador', 'anticongel', 'termostato', 'bomba de agua'] },
  { id: 'transmision', icon: '🕹️', label: 'Transmisión / Embrague', km: 60000, meses: 0, kw: ['transmis', 'embrague', 'caja', 'diferencial', 'cardan', 'cardán', 'transfer'] },
  { id: 'bujias', icon: '🔥', label: 'Bujías / Encendido', km: 30000, meses: 36, kw: ['buj', 'encendido', 'cable de buj', 'bobina'] },
  { id: 'electrico', icon: '💡', label: 'Luces / Eléctrico', km: 0, meses: 0, kw: ['luz', 'luces', 'lámpara', 'lampara', 'eléctr', 'electr', 'alternador', 'burro', 'arranque'] },
  { id: 'aire', icon: '🌬️', label: 'Aire acond. / Filtros', km: 0, meses: 12, kw: ['aire acond', 'a/a', 'habitáculo', 'habitaculo', 'polen', 'filtro de aire'] },
  { id: 'carroceria', icon: '🎨', label: 'Carrocería / Pintura', km: 0, meses: 0, kw: ['carroc', 'pintur', 'chapa', 'capot', 'paragolpe'] },
  { id: 'papeles', icon: '📄', label: 'VTV / Seguro / Patente', km: 0, meses: 12, kw: ['vtv', 'seguro', 'patente', 'rto', 'cédula', 'cedula', 'registro'] },
  { id: 'lavado', icon: '🧼', label: 'Lavado / Detailing', km: 0, meses: 1, kw: ['lavado', 'detail', 'pulido', 'encerado'] },
  { id: 'general', icon: '🔧', label: 'Service General', km: 10000, meses: 12, kw: ['service', 'revisi', 'mantenimiento'] },
  { id: 'otro', icon: '➕', label: 'Otro', km: 0, meses: 0, kw: [] },
];
function catById(id) { return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1]; }
function detectCat(text) {
  const t = (text || '').toLowerCase();
  for (const c of CATEGORIES) if (c.kw.some(k => t.includes(k))) return c.id;
  return 'otro';
}

const MARCAS = ['Peugeot', 'Toyota', 'Ford', 'Chevrolet', 'Volkswagen', 'Fiat', 'Renault', 'Citroën', 'Honda', 'Nissan', 'Jeep', 'Mercedes-Benz', 'BMW', 'Audi', 'Hyundai', 'Kia', 'Suzuki', 'Mitsubishi', 'Mazda', 'RAM', 'Iveco', 'Scania', 'Volvo', 'Yamaha', 'Zanella', 'Motomel', 'Corven', 'Gilera', 'Kawasaki', 'Bajaj', 'KTM', 'Royal Enfield'];
const MODELOS = {
  Peugeot: ['106', '206', '207', '208', '307', '307 CC', '308', '408', '2008', '3008', 'Partner', 'Expert', 'Boxer'],
  Toyota: ['Hilux', '4Runner', 'SW4', 'Corolla', 'Etios', 'Yaris', 'RAV4', 'Land Cruiser', 'Camry', 'Hiace'],
  Ford: ['Ranger', 'Fiesta', 'Focus', 'Ka', 'EcoSport', 'Kuga', 'Mondeo', 'Transit', 'F-100', 'Falcon'],
  Chevrolet: ['Corsa', 'Onix', 'Cruze', 'Prisma', 'Tracker', 'S10', 'Spin', 'Astra', 'Meriva', 'Vectra'],
  Volkswagen: ['Gol', 'Polo', 'Vento', 'Golf', 'Amarok', 'Taos', 'T-Cross', 'Saveiro', 'Suran', 'Fox', 'Bora'],
  Fiat: ['Uno', 'Palio', 'Siena', 'Cronos', 'Argo', 'Toro', 'Strada', 'Fiorino', 'Ducato', 'Pulse'],
  Renault: ['Clio', 'Sandero', 'Logan', 'Kangoo', 'Duster', 'Kwid', 'Megane', 'Fluence', 'Oroch', 'Master'],
  Citroën: ['C3', 'C4', 'C4 Cactus', 'Berlingo', 'Xsara', 'Picasso', 'C3 Aircross'],
  Honda: ['Civic', 'Fit', 'HR-V', 'CR-V', 'City', 'Accord', 'Wave', 'CB 250', 'XR 150'],
  Nissan: ['Frontier', 'March', 'Versa', 'Kicks', 'Sentra', 'X-Trail', 'Tiida'],
  Jeep: ['Renegade', 'Compass', 'Wrangler', 'Grand Cherokee'],
  'Mercedes-Benz': ['Clase A', 'Clase C', 'Sprinter', 'Vito', 'ML', 'Atego', 'Actros'],
  Yamaha: ['YBR 125', 'FZ 150', 'MT-03', 'XTZ 250', 'R3'],
  Zanella: ['ZB 110', 'RX 150', 'Sapucai'],
  Motomel: ['Skua 150', 'CG 150', 'Blitz 110'],
};
