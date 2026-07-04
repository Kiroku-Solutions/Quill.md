import fs from 'fs';

const dict = JSON.parse(fs.readFileSync('scripts/es-dict.json'));

const translations = {
	Analysis: 'Análisis',
	Implementation: 'Implementación',
	Review: 'Revisión',
	'Solution Demo': 'Demostración de la Solución',
	'Strategic Theme': 'Tema Estratégico',
	Portfolio: 'Portafolio',
	'Business owner': 'Dueño de Negocio',
	'Epic owner': 'Dueño de Épica',
	'WSJF score': 'Puntuación WSJF',
	ART: 'Tren de Liberación Ágil (ART)',
	Capability: 'Capacidad',
	'Solution train': 'Tren de Solución',
	'Capability owner': 'Dueño de Capacidad',
	'WSJF priority': 'Prioridad WSJF',
	'Acceptance criteria (FIT)': 'Criterios de Aceptación (FIT)',
	'Product manager': 'Gerente de Producto',
	'Enabler Story': 'Historia Habilitadora',
	'Enabler kind': 'Tipo de Habilitador',
	'Parent feature': 'Característica Padre',
	'Large-Scale Scrum': 'Scrum a Gran Escala',
	'Build one product with multiple teams, sharing one Product Owner, one Product Backlog, and one Sprint cadence.':
		'Construir un producto con múltiples equipos, compartiendo un Dueño de Producto, un Backlog de Producto y una cadencia de Sprint.',
	'Story meets the team-level DoD and is integrated into the overall product.':
		'La historia cumple con la Definición de Hecho (DoD) del equipo y está integrada en el producto general.',
	'Story is potentially shippable in the next release.':
		'La historia es potencialmente entregable en el próximo lanzamiento.',
	'All teams accept the integration.': 'Todos los equipos aceptan la integración.',
	'Refining (multi-team)': 'Refinamiento (multi-equipo)',
	'Sprint Backlog': 'Backlog del Sprint',
	'Sprint Review (all teams)': 'Revisión del Sprint (todos los equipos)',
	'Backlog Refinement': 'Refinamiento del Backlog',
	'For area (LeSS Huge)': 'Por área (LeSS Huge)',
	'Teams involved (comma-separated)': 'Equipos involucrados (separados por comas)',
	'Integrate work across 3–9 Scrum teams every Sprint through a Nexus Integration Team and a shared Nexus Goal.':
		'Integrar el trabajo a través de 3-9 equipos Scrum cada Sprint mediante un Equipo de Integración Nexus y un Objetivo Nexus compartido.',
	'User story is integrated with cross-team dependencies.':
		'La historia de usuario está integrada con dependencias inter-equipos.',
	'Definition of Done is consistent across all teams.':
		'La Definición de Hecho (DoD) es consistente en todos los equipos.',
	'Integrated increment passes the Nexus Daily Scrum integration check.':
		'El incremento integrado pasa el control de integración del Nexus Daily Scrum.',
	'Team Backlog': 'Backlog del Equipo',
	'Integration (NIT)': 'Integración (NIT)',
	'Nexus Sprint Review': 'Revisión del Sprint Nexus',
	'Done (Integrated Increment)': 'Hecho (Incremento Integrado)',
	'Integration Task': 'Tarea de Integración',
	'Teams blocked (comma-separated)': 'Equipos bloqueados (separados por comas)',
	'NIT owner': 'Dueño NIT',
	'Scrum@Scale': 'Scrum@Scale',
	'Scale Scrum through a Scrum of Scrums (SM Cycle) and a Chief Product Owner + MetaScrum (PO Cycle).':
		'Escalar Scrum a través de un Scrum de Scrums (Ciclo SM) y un Chief Product Owner + MetaScrum (Ciclo PO).',
	'Impediment has an explicit owner and an explicit escalation path.':
		'El impedimento tiene un responsable explícito y una ruta de escalamiento explícita.',
	'Scaling meeting action has a target date and accountable owner.':
		'La acción de la reunión de escalado tiene una fecha objetivo y un responsable.',
	'Impediments that bubble past one SoS are added to the next SoS of SoS backlog.':
		'Los impedimentos que superan un SoS se añaden al backlog del siguiente SoS de SoS.',
	'Impediment (open)': 'Impedimento (abierto)',
	'Escalated to SoSoS': 'Escalado a SoSoS',
	Impediment: 'Impedimento',
	'Reporting team': 'Equipo reportador',
	Escalation: 'Escalamiento',
	'Scaling Meeting Action': 'Acción de Reunión de Escalado',
	'From forum': 'Del foro',
	Due: 'Vence',
	'Spotify Model': 'Modelo Spotify',
	'Operate as a network of autonomous squads, aligned through tribes, chapters and guilds and quarterly bets.':
		'Operar como una red de escuadrones autónomos, alineados a través de tribus, capítulos, gremios y apuestas trimestrales.',
	'Squad initiative is owned by a Trio (Product, Design, Tech).':
		'La iniciativa del escuadrón es propiedad de un Trío (Producto, Diseño, Tecnología).',
	'Tribe bet has been recorded in the quarterly bet table.':
		'La apuesta de la tribu ha sido registrada en la tabla de apuestas trimestrales.',
	'Chapter task is approved by the Chapter Lead and the Tribe Lead.':
		'La tarea del capítulo es aprobada por el Líder del Capítulo y el Líder de la Tribu.',
	'Bet open': 'Apuesta abierta',
	'Bet placed': 'Apuesta realizada',
	Killed: 'Eliminada',
	'Squad Initiative': 'Iniciativa de Escuadrón',
	Squad: 'Escuadrón',
	Tribe: 'Tribu',
	'Trio lead': 'Líder del trío',
	'Long-lived mission': 'Misión a largo plazo',
	'Chapter Task': 'Tarea de Capítulo',
	Chapter: 'Capítulo',
	'Chapter lead': 'Líder de capítulo',
	'Guild Initiative': 'Iniciativa de Gremio',
	Guild: 'Gremio',
	Coordinator: 'Coordinador',
	'Tribe Bet': 'Apuesta de Tribu',
	Quarter: 'Trimestre',
	'Bet table members': 'Miembros de la mesa de apuestas',
	'Disciplined Agile Delivery': 'Entrega Ágil Disciplinada',
	'Tailor your way of working to context — pick a DA lifecycle, choose strategies per process goal, and ship consumable solutions.':
		'Adapta tu forma de trabajar al contexto: elige un ciclo de vida DA, selecciona estrategias por objetivo de proceso y entrega soluciones consumibles.',
	'Work item is potentially consumable (integrated, tested, deployable).':
		'El elemento de trabajo es potencialmente consumible (integrado, probado, desplegable).',
	'All applicable process goals have a recorded strategy choice.':
		'Todos los objetivos de proceso aplicables tienen una estrategia registrada.',
	'Initial deployment readiness criteria (Transition phase) are met.':
		'Se cumplen los criterios iniciales de preparación para el despliegue (fase de Transición).',
	Inception: 'Incepción',
	Construction: 'Construcción',
	Transition: 'Transición',
	'In production': 'En producción',
	Retired: 'Retirado',

	// Long descriptions:
	'Scrum is the default team-level agile framework. A self-managing team (≤ 9) pulls work from a Product Backlog ordered by value, commits to a Sprint Backlog inside a time-boxed Sprint (1–4 weeks, most often 2), and ends with a Review (demo) and a Retrospective (inspect & adapt). Three accountabilities: Product Owner (value), Scrum Master (process), Developers (build). Artifacts: Product Backlog, Sprint Backlog, Increment; Definition of Done gates the Increment. The 2020 *Scrum Guide* dropped the "Development Team" role and merged it with the Developers; the daily standup was renamed "Daily Scrum" with structure left to the team.':
		'Scrum es el marco ágil predeterminado a nivel de equipo. Un equipo autogestionado (≤ 9) extrae trabajo de un Product Backlog ordenado por valor, se compromete con un Sprint Backlog dentro de un Sprint de duración fija (1–4 semanas, más a menudo 2), y termina con una Revisión (demo) y una Retrospectiva (inspeccionar y adaptar). Tres responsabilidades: Product Owner (valor), Scrum Master (proceso), Desarrolladores (construcción). Artefactos: Product Backlog, Sprint Backlog, Incremento; la Definición de Hecho (DoD) controla el Incremento. La *Guía Scrum* de 2020 eliminó el rol de "Equipo de Desarrollo" y lo fusionó con los Desarrolladores; el standup diario fue renombrado a "Daily Scrum" dejando la estructura a decisión del equipo.',

	'Kanban (Japanese: "signboard") is a method, not a process. It visualises work as cards flowing through columns of a board, each column bounded by an explicit Work-in-Progress (WIP) limit, and optimises for *flow* metrics (cycle time, lead time, throughput) rather than utilisation. The 2021 *Kanban Guide* condenses Anderson\'s "Seven Cadences" + Core Practices into 5 properties (visualise, limit WIP, manage flow, make process policies explicit, implement feedback loops) plus 6 practices. There are no prescribed roles, no time-boxes, no estimates, and the team pulls work on demand.':
		'Kanban (Japonés: "letrero") es un método, no un proceso. Visualiza el trabajo como tarjetas que fluyen a través de columnas de un tablero, cada columna limitada por un límite explícito de Trabajo en Progreso (WIP), y optimiza para métricas de *flujo* (tiempo de ciclo, tiempo de entrega, rendimiento) en lugar de utilización. La *Guía Kanban* de 2021 condensa las "Siete Cadencias" y Prácticas Centrales de Anderson en 5 propiedades (visualizar, limitar el WIP, gestionar el flujo, hacer explícitas las políticas de proceso, implementar bucles de retroalimentación) más 6 prácticas. No hay roles prescritos, ni bloques de tiempo, ni estimaciones, y el equipo extrae el trabajo bajo demanda.',

	'XP is the engineering-practices-first agile framework. Twelve core practices in the first edition (Planning Game, Small Releases, Metaphor, Simple Design, Testing, Refactoring, Pair Programming, Collective Ownership, Continuous Integration, 40-Hour Week, On-Site Customer, Coding Standards); the second edition collapses them into 13 by adding *Courage* and *Stories*. The Planning Game produces user stories, which are split into engineering tasks; estimation is in *ideal engineering weeks* (one story ≤ 2 ideal weeks). XP emphasises feedback at three levels — unit tests, acceptance tests, customer release. The most distinctive feature vs Scrum: the on-site customer is *part of the team*, not a product owner role proxy.':
		'XP es el marco ágil que prioriza las prácticas de ingeniería. Doce prácticas centrales en la primera edición (Juego de Planificación, Lanzamientos Pequeños, Metáfora, Diseño Simple, Pruebas, Refactorización, Programación en Parejas, Propiedad Colectiva, Integración Continua, Semana de 40 Horas, Cliente en el Sitio, Estándares de Codificación); la segunda edición las agrupa en 13 añadiendo *Coraje* e *Historias*. El Juego de Planificación produce historias de usuario, que se dividen en tareas de ingeniería; la estimación es en *semanas ideales de ingeniería* (una historia ≤ 2 semanas ideales). XP enfatiza la retroalimentación en tres niveles: pruebas unitarias, pruebas de aceptación, lanzamiento al cliente. La característica más distintiva frente a Scrum: el cliente en el sitio es *parte del equipo*, no un proxy del rol de product owner.',

	"Lean is *philosophy* before framework. The Poppendiecks translated the Toyota Production System's seven principles — *Eliminate Waste, Amplify Learning, Decide as Late as Possible, Deliver as Fast as Possible, Empower the Team, Build Integrity In, See the Whole* — into software. The seven wastes mapped to software are: partially done work, extra features, relearning, handoffs, task switching, delays, defects. There are no prescribed roles, no time-boxes, no ceremonies; the artefact is the *value stream map*.":
		'Lean es *filosofía* antes que marco de trabajo. Los Poppendieck tradujeron los siete principios del Sistema de Producción de Toyota: *Eliminar Desperdicio, Amplificar el Aprendizaje, Decidir lo más Tarde Posible, Entregar lo más Rápido Posible, Empoderar al Equipo, Incorporar la Integridad, Ver el Todo*, al software. Los siete desperdicios mapeados al software son: trabajo parcialmente hecho, características adicionales, reaprendizaje, traspasos, cambio de tareas, retrasos, defectos. No hay roles prescritos, ni bloques de tiempo, ni ceremonias; el artefacto es el *mapa de flujo de valor*.',

	'FDD is a model-driven, short-iteration agile process built around the *feature* — a small, client-valued function expressed as `<action> <result> <object>` (e.g. "Calculate the total of a sale"). Five sequential process steps — **Develop an Overall Model**, **Build a Features List**, **Plan by Feature**, **Design by Feature**, **Build by Feature** — with the first two done once and the last three repeated for every 2-week feature batch. Class ownership is the most distinctive FDD concept: a single developer owns each class; features are implemented by feature teams made up of the relevant class owners. Originally conceived on a 50-person 15-month banking project in Singapore; well-suited to large, complex-domain teams.':
		'FDD es un proceso ágil de iteraciones cortas impulsado por modelos, construido alrededor de la *característica* (feature): una función pequeña valorada por el cliente expresada como `<acción> <resultado> <objeto>` (por ejemplo, "Calcular el total de una venta"). Cinco pasos de proceso secuenciales: **Desarrollar un Modelo General**, **Construir una Lista de Características**, **Planificar por Característica**, **Diseñar por Característica**, **Construir por Característica**, donde los dos primeros se realizan una vez y los tres últimos se repiten para cada lote de características de 2 semanas. La propiedad de las clases es el concepto más distintivo de FDD: un solo desarrollador es dueño de cada clase; las características son implementadas por equipos de características formados por los dueños de clases relevantes. Concebido originalmente en un proyecto bancario de 50 personas y 15 meses en Singapur; muy adecuado para equipos grandes en dominios complejos.',

	'Crystal is a *family* of methodologies parameterised on team size and project criticality — Crystal Clear (≤ 8 people, "comfortable"), Crystal Yellow (up to 20, "more money"), Crystal Orange (20–40, "critical"), Crystal Red, Crystal Maroon for larger. The methodology is deliberately light on ceremony; the heaviest weight goes on (a) *people*: face-to-face communication, ideally co-located; (b) *delivery*: incremental, frequent; (c) *reflection*: a "Reflection Workshop" every month or so. The four properties are: *Frequent Delivery, Reflective Improvement, Osmotic Communication, Personal Safety*. Crystal Clear is the most adopted member; Crystal Orange is documented in the 2004 book.':
		'Crystal es una *familia* de metodologías parametrizadas según el tamaño del equipo y la criticidad del proyecto: Crystal Clear (≤ 8 personas, "cómodo"), Crystal Yellow (hasta 20, "más dinero"), Crystal Orange (20–40, "crítico"), Crystal Red, Crystal Maroon para proyectos más grandes. La metodología es deliberadamente ligera en ceremonias; el mayor peso recae en (a) *personas*: comunicación cara a cara, idealmente co-ubicados; (b) *entrega*: incremental, frecuente; (c) *reflexión*: un "Taller de Reflexión" más o menos cada mes. Las cuatro propiedades son: *Entrega Frecuente, Mejora Reflexiva, Comunicación Osmótica, Seguridad Personal*. Crystal Clear es el miembro más adoptado; Crystal Orange está documentado en el libro de 2004.',

	'DSDM is the *original* agile method (1994–95), born from RAD. The "Atern" brand (2007+) renamed the lifecycle; the "Agile Project Framework" (APF, 2014) is the current public name. The eight principles are: *Focus on the Business Need, Deliver on Time, Collaborate, Never Compromise Quality, Build Incrementally from Firm Foundations, Develop Iteratively, Communicate Continuously and Clearly, Demonstrate Control*. Two signature techniques: *MoSCoW prioritisation* (Must / Should / Could / Won\'t) and *Timeboxing* (fixed cost, fixed time, fixed quality; only scope flexes). Three lifecycle phases: **Feasibility**, **Foundations**, **Exploratory** + **Engineering**, **Deployment**. The PM role is explicitly preserved (rare for an agile method).':
		'DSDM es el método ágil *original* (1994–95), nacido de RAD. La marca "Atern" (2007+) renombró el ciclo de vida; el "Agile Project Framework" (APF, 2014) es el nombre público actual. Los ocho principios son: *Enfocarse en la Necesidad del Negocio, Entregar a Tiempo, Colaborar, Nunca Comprometer la Calidad, Construir Incrementalmente desde Cimientos Firmes, Desarrollar Iterativamente, Comunicarse Continua y Claramente, Demostrar Control*. Dos técnicas distintivas: *Priorización MoSCoW* (Must / Should / Could / Won\'t) y *Timeboxing* (costo fijo, tiempo fijo, calidad fija; solo el alcance es flexible). Tres fases del ciclo de vida: **Factibilidad**, **Fundamentos**, **Exploratorio** + **Ingeniería**, **Despliegue**. El rol del PM se conserva explícitamente (algo raro para un método ágil).',

	"Scrumban started life as a transitional state for Scrum teams moving to Kanban (Corey Ladas' 2008 essay). It quickly stabilised as its own framework: *plan when you need to, not on a fixed cadence*. The four mechanics are: **pull system** (engineers pull from a Ready queue), **WIP limits** (per board column), **Ready queue** (groomed buffer between backlog and active work), and **on-demand planning** (planning fires when the Ready queue drops below a threshold, typically 5–8 items per developer). The bucket planning method (1 year / 6 months / 3 months / current) carries strategic context into a flow that is otherwise tactical.":
		'Scrumban comenzó su vida como un estado transicional para equipos Scrum que pasaban a Kanban (ensayo de Corey Ladas en 2008). Rápidamente se estabilizó como su propio marco: *planifica cuando lo necesites, no en una cadencia fija*. Las cuatro mecánicas son: **sistema pull** (los ingenieros extraen de una cola Listo), **límites WIP** (por columna del tablero), **cola Listo** (búfer refinado entre el backlog y el trabajo activo), y **planificación bajo demanda** (la planificación se activa cuando la cola Listo cae por debajo de un umbral, típicamente 5–8 ítems por desarrollador). El método de planificación por cubos (1 año / 6 meses / 3 meses / actual) lleva el contexto estratégico a un flujo que de otra manera sería táctico.',

	"Shape Up is Basecamp's product development method. Three phases: **Shape** (senior people define the problem and a solution at the right level of abstraction — *concrete enough to act, abstract enough to own*), **Bet** (the betting table picks which shaped projects to fund for the next 6-week cycle, fixes the *appetite* — time budget — and discards the rest), **Build** (a small integrated team of designers and engineers owns the project, defines tasks, builds vertical slices, and ships or kills by the end of the cycle). Two non-negotiable rules: (a) projects have a *circuit breaker* — no extensions; (b) work is not pulled from a shared backlog. The key artefacts are the **Pitch** (the shaped document) and the **Hill Chart** (known vs unknown progress).":
		'Shape Up es el método de desarrollo de productos de Basecamp. Tres fases: **Modelar (Shape)** (personas experimentadas definen el problema y una solución en el nivel correcto de abstracción: *suficientemente concreto para actuar, suficientemente abstracto para apropiarse*), **Apostar (Bet)** (la mesa de apuestas elige qué proyectos modelados financiar para el próximo ciclo de 6 semanas, fija el *apetito* —presupuesto de tiempo— y descarta el resto), **Construir (Build)** (un pequeño equipo integrado de diseñadores e ingenieros se apropia del proyecto, define tareas, construye rebanadas verticales, y entrega o cancela al final del ciclo). Dos reglas no negociables: (a) los proyectos tienen un *interruptor* — no hay extensiones; (b) el trabajo no se extrae de un backlog compartido. Los artefactos clave son el **Pitch** (el documento modelado) y el **Gráfico de Colina (Hill Chart)** (progreso conocido frente a desconocido).',

	'SAFe 6.0 is the most adopted enterprise scaling framework (≈44% of scaling organisations per the 17th State of Agile). The "Big Picture" stacks four configurations — **Essential**, **Large Solution**, **Portfolio**, **Full** — on top of a *Lean-Agile* foundation: a Lean-Agile Mindset, four Core Values (Alignment, Relentless Improvement, Transparency, Respect for People), six SAFe Principles, and the Implementation Roadmap. The 6.0 release (March 2023) introduced the *Business Agility Value Stream*, the *Eight Properties of Flow* (replacing a long list of "flow accelerators"), renamed several roles (Scrum Master → Scrum Master / Team Coach; Product Manager → Product Owner for team scope), renamed several events (System Demo → Solution Demo; Scrum of Scrums → Coach Sync), and added **Continuous Learning Culture** as a core competency (not only in Full). At the team level SAFe is essentially SAFe-Scrum or SAFe-Kanban; the unique SAFe additions are the **Program Increment (PI)** — typically 8–12 weeks, 5 iterations + 1 IP iteration — and the **PI Planning** event. The 7 Core Competencies: Lean-Agile Leadership, Team and Technical Agility, Agile Product Delivery, Enterprise Solution Delivery, Lean Portfolio Management, Organizational Agility, Continuous Learning Culture.':
		'SAFe 6.0 es el marco de escalado empresarial más adoptado (≈44% de las organizaciones según el 17º Estado de Ágil). El "Big Picture" apila cuatro configuraciones: **Esencial**, **Gran Solución**, **Portafolio**, **Completo**, sobre una base *Lean-Ágil*: una Mentalidad Lean-Ágil, cuatro Valores Centrales (Alineación, Mejora Implacable, Transparencia, Respeto por las Personas), seis Principios SAFe y la Hoja de Ruta de Implementación. La versión 6.0 introdujo el *Flujo de Valor de Agilidad Empresarial*, las *Ocho Propiedades de Flujo*, renombró roles y eventos, y agregó **Cultura de Aprendizaje Continuo** como competencia central. A nivel de equipo, SAFe es esencialmente SAFe-Scrum o SAFe-Kanban; las adiciones únicas de SAFe son el **Incremento de Programa (PI)** y el evento de **Planificación PI**.',

	'LeSS is the most minimalist scaling framework: it is "Scrum applied to multiple teams working together on one product." Two sizes — **LeSS** (2–8 teams) and **LeSS Huge** (8+ teams, adds an Area Product Backlog). The single most important rule: *one Product Owner, one Product Backlog, one Sprint cadence*. No new roles, no new artefacts. Coordination mechanisms: Sprint Planning with all teams in the same room, overall Product Backlog Refinement with the Area Product Owner (LeSS Huge only), and a *multi-team Product Backlog Refinement* that forces cross-team conversations. The 2024 *More with LeSS* book adds a fourth rule: *go to the customer* (LeSS is a *descaling* — it removes organisational layers, it does not add them).':
		'LeSS es el marco de escalado más minimalista: es "Scrum aplicado a múltiples equipos que trabajan juntos en un producto". Dos tamaños: **LeSS** (2–8 equipos) y **LeSS Huge** (8+ equipos, añade un Backlog de Producto de Área). La regla más importante: *un Dueño de Producto, un Backlog de Producto, una cadencia de Sprint*. No hay roles ni artefactos nuevos. Mecanismos de coordinación: Planificación del Sprint con todos los equipos en la misma sala, Refinamiento general del Backlog con el Dueño de Producto de Área (solo LeSS Huge), y un *Refinamiento del Backlog multi-equipo* que fuerza conversaciones entre equipos.',

	"Nexus is Scrum.org's answer to scaling Scrum for **3–9 teams working on one product**. It is *additive* on top of Scrum: keep the Scrum roles, events, and artefacts, but add a *Nexus Integration Team* (a small group — 3 to 9 people — who own integration concerns), and replace the multi-team planning chaos with **Nexus Sprint Planning**, **Nexus Daily Scrum**, **Nexus Sprint Review**, and **Nexus Sprint Retrospective**. The new artefacts: an **Nexus Goal** (the single product goal for the Sprint), a **Nexus Sprint Backlog** (the union of all team Sprint Backlogs), and a **Nexus Integration Team Backlog** (the integration work). Nexus prescribes nothing else — it expects the teams to fill gaps with XP / Kanban / DevOps practices.":
		'Nexus es la respuesta de Scrum.org para escalar Scrum a **3–9 equipos trabajando en un producto**. Es *aditivo* sobre Scrum: conserva los roles, eventos y artefactos, pero añade un *Equipo de Integración Nexus* (3 a 9 personas que se encargan de la integración), y reemplaza el caos de planificación multi-equipo con **Planificación de Sprint Nexus**, **Scrum Diario Nexus**, **Revisión de Sprint Nexus** y **Retrospectiva de Sprint Nexus**. Los nuevos artefactos: un **Objetivo Nexus**, un **Backlog de Sprint Nexus** y un **Backlog del Equipo de Integración Nexus**. Nexus no prescribe nada más, espera que los equipos llenen los vacíos con prácticas de XP / Kanban / DevOps.',

	'Scrum@Scale is the *organic* scaling of Scrum. The base unit is a Scrum team; scaling is by replicating the *Scrum Master* role into a "Scrum of Scrums" (SoS) and the *Product Owner* role into a "Chief Product Owner" + a "MetaScrum" (a forum of all POs). Recursive: SoS of SoS scales the Scrum Master function; a large forum of POs scales the Product Owner function. The Reference Model is split into two cycles — the **Scrum Master Cycle** (remove impediments, improve quality, resolve cross-team dependencies) and the **Product Owner Cycle** (coordinate the product backlog, release planning, prioritisation). The framework is intentionally *less prescriptive* than SAFe — the modules are optional.':
		'Scrum@Scale es el escalado *orgánico* de Scrum. La unidad base es un equipo Scrum; el escalado se realiza replicando el rol del *Scrum Master* en un "Scrum de Scrums" (SoS) y el rol del *Dueño de Producto* en un "Dueño de Producto Jefe" + un "MetaScrum". Recursivo: SoS de SoS escala la función del Scrum Master; un foro de POs escala la función del Dueño de Producto. El Modelo de Referencia se divide en dos ciclos: el **Ciclo del Scrum Master** (eliminar impedimentos, mejorar calidad) y el **Ciclo del Dueño de Producto** (coordinar el backlog, planificación de lanzamientos).',

	'The Spotify Model is a *set of patterns* for scaling autonomy with alignment, not a process framework. The four units: **Squad** (a 6–10-person cross-functional team owning a customer journey, *like a mini-startup* — picks its own way of working), **Tribe** (a collection of related squads, capped at ≈100 by Dunbar\'s number), **Chapter** (a discipline-based community within a tribe — all the iOS engineers meet, etc.), **Guild** (a voluntary, cross-tribe community of interest). Squads have a Product Owner, an Agile Coach (the Spotify rebrand of Scrum Master), and an Engineering Lead. Leadership is by a *trio*: design / product / tech leads. Quarterly planning ("bets") align the tribes. The 2012 whitepaper is famously cautious: Spotify itself has evolved past the published snapshot, and Henrik Kniberg has explicitly warned against 1:1 copying.':
		'El Modelo Spotify es un *conjunto de patrones* para escalar autonomía con alineación, no un marco de procesos. Las cuatro unidades: **Escuadrón (Squad)** (equipo multifuncional de 6–10 personas dueño de un viaje del cliente, *como una mini-startup*), **Tribu (Tribe)** (colección de escuadrones relacionados, limitada a ≈100), **Capítulo (Chapter)** (comunidad basada en disciplina dentro de una tribu), **Gremio (Guild)** (comunidad de interés voluntaria inter-tribus). El liderazgo es por un *trío*: líderes de diseño / producto / tecnología. Las planificaciones trimestrales ("apuestas") alinean a las tribus. El documento de 2012 advierte explícitamente contra la copia 1:1.',

	'Disciplined Agile is the *most flexible* framework in this catalog. The original DAD (2012) was a hybrid Scrum + Kanban + Lean approach with a *Risk-Value Lifecycle* (Inception → Construction → Transition → Ongoing) and 21 (later 24) *Process Goals*. The DA Toolkit (PMI, 2018+) adds **Disciplined DevOps** and **Disciplined Agile IT (DAIT)**, and introduces six explicit lifecycles — **Agile (Scrum-based)**, **Lean (Kanban-based)**, **Continuous Delivery: Agile**, **Continuous Delivery: Lean**, **Exploratory (Lean Startup)**, **Program (Team of Teams)**. The DA philosophy is "context counts, choice is good, be awesome" — pick the lifecycle that matches the team\'s context, then choose a strategy for each process goal. There is no single correct way to run a DA project.':
		'Disciplined Agile es el marco *más flexible* en este catálogo. El DAD original (2012) era un enfoque híbrido de Scrum + Kanban + Lean con un *Ciclo de Vida de Riesgo-Valor* (Incepción → Construcción → Transición → Continuo) y 21 *Objetivos de Proceso*. El Kit de Herramientas DA (PMI, 2018+) añade **DevOps Disciplinado** y **TI Ágil Disciplinada (DAIT)**, e introduce seis ciclos de vida explícitos: **Ágil (basado en Scrum)**, **Lean (basado en Kanban)**, **Entrega Continua: Ágil**, **Entrega Continua: Lean**, **Exploratorio (Lean Startup)**, **Programa (Equipo de Equipos)**. La filosofía DA es "el contexto cuenta, la elección es buena, sé increíble".',

	'Team Topologies (Skelton & Pais, 2019; 2nd ed. 2024) is a *practical, adaptive* model for designing software teams for fast flow. Four fundamental team types: **Stream-aligned** (the default — owns a single valuable flow of work, e.g. a customer journey, 80–90% of the org), **Platform** (provides internal services that stream-aligned teams self-serve; treated as a *product*, with a *thinnest viable platform* mandate), **Enabling** (specialists who help stream-aligned teams gain capabilities they are missing; "teach to fish"), **Complicated-Subsystem** (deep-specialist teams who own a subsystem requiring PhD-level skills). Three interaction modes between teams: **Collaboration**, **X-as-a-Service**, **Facilitating**. The foundational concept: **cognitive load** (intrinsic / extraneous / germane) is the *single most important* design variable — a team is overloaded when its mental workload exceeds its capacity. The 2nd edition (2024) extends the lens to whole-organisation transformation, multi-company portfolios, and the concept of *platform groupings* (a fractal application of the four team types).':
		'Topologías de Equipos es un modelo *práctico y adaptativo* para diseñar equipos de software para flujo rápido. Cuatro tipos fundamentales de equipos: **Alineado al flujo (Stream-aligned)** (dueño de un único flujo de trabajo valioso, 80–90% de la org), **Plataforma** (proporciona servicios internos), **Habilitador** (especialistas que ayudan a los equipos alineados al flujo), **Subsistema Complicado** (equipos superespecialistas). Tres modos de interacción: **Colaboración**, **X-como-Servicio**, **Facilitación**. El concepto fundamental: la **carga cognitiva** es la variable de diseño *más importante*.',

	'DevOps is the convergence of agile, lean, and systems engineering applied to *delivery* — getting code from commit to production safely, quickly, and reliably. The DORA (DevOps Research and Assessment) research program identified four software delivery *performance* metrics: **Lead Time for Change**, **Deployment Frequency**, **Change Failure Rate**, **Mean Time to Restore (MTTR)** — and the elite-performer benchmarks that organisations chase (lead time < 1 hour, deploy on demand, change failure rate 0–15%, MTTR < 1 hour). *Accelerate* (Humble, Kim, Forsgren, 2018) correlated these metrics with organisational performance: the 24 capabilities that predict them cluster into *Continuous Delivery*, *Architecture*, *Product and Process*, *Lean Management and Monitoring*, *Cultural*. The 2018 book and the *DevOps Handbook* (2nd ed., 2020) are the canonical references.':
		'DevOps es la convergencia de la ingeniería ágil, lean y de sistemas aplicada a la *entrega*: llevar el código desde el commit hasta producción de forma segura, rápida y confiable. El programa de investigación DORA identificó cuatro métricas de *rendimiento* de entrega de software: **Tiempo de Entrega para Cambios**, **Frecuencia de Despliegue**, **Tasa de Fallos de Cambio**, **Tiempo Medio de Restauración (MTTR)**. *Accelerate* correlacionó estas métricas con el rendimiento organizacional a través de 24 capacidades predictivas.',

	"OKRs (Objectives and Key Results) are *not* a process framework — they are a goal-alignment tool invented at Intel by Andy Grove in 1971 (book 1983), popularised in the tech industry by John Doerr's 2018 *Measure What Matters*. An *Objective* is a qualitative, ambitious, time-bound goal. *Key Results* are 3–5 quantitative, time-bound, ambitious-but-attainable measures of progress. OKRs complement (do not replace) an agile delivery framework. The Google contribution was OKRs-as-cultural-practice: quarterly cadence, 0.7-as-the-target-score (perfect 1.0 is failure), transparent across the company, decoupled from performance reviews. Pairings: OKRs + Scrum (most common); OKRs + Shape Up; OKRs + Spotify (the trio reports OKRs at the squad / tribe level).":
		'Los OKRs (Objetivos y Resultados Clave) *no* son un marco de proceso, son una herramienta de alineación de objetivos inventada en Intel. Un *Objetivo* es una meta cualitativa, ambiciosa y con límite de tiempo. Los *Resultados Clave* son 3–5 medidas de progreso cuantitativas. Los OKR complementan un marco de entrega ágil. La contribución de Google fue adoptar los OKR como práctica cultural: cadencia trimestral, 0.7 como puntuación objetivo (1.0 es fracaso), transparencia y desacoplamiento de las evaluaciones de desempeño.',

	'Lean Startup (Ries, 2011) is the agile-of-new-products: *validated learning* through **Build-Measure-Learn** loops. The two core mechanics: **Minimum Viable Product (MVP)** — the smallest thing you can build to start the learning loop — and **Validated Learning** — evidence-based decisions from data, not from opinion. Two related concepts: **Innovation Accounting** (treat product development as financial accounting, with metrics like *innovations*, *time-to-first-pivot*, *pivot or persevere*); and **Pivot** (change direction, not vision, when the data says). The Build-Measure-Learn cadence is *weeks*, not months. Lean Startup is the inspiration for DA\'s "Exploratory" lifecycle and for most modern growth / experimentation teams.':
		'Lean Startup es el "ágil de los nuevos productos": *aprendizaje validado* a través de ciclos **Construir-Medir-Aprender**. Las dos mecánicas principales: **Producto Mínimo Viable (MVP)** (lo más pequeño que puedes construir para iniciar el ciclo de aprendizaje) y **Aprendizaje Validado** (decisiones basadas en datos, no en opiniones). Conceptos relacionados: **Contabilidad de Innovación** y **Pivote** (cambiar de dirección, no de visión, cuando los datos lo indican). La cadencia es de *semanas*, no meses.',

	'Water-Scrum-Fall is the *observed pattern* in regulated enterprise IT: heavy-upfront requirements (Water), a Scrum or Kanban middle (Scrum / Kanban), and heavy-upstream-or-downstream specialist work (Fall). Larman & Vodde documented it as the typical anti-LeSS situation — and the practical reality of most enterprise IT shops. It is *not* a framework in the prescriptive sense, but a *pattern* that the team must accept before they can reduce the Water or the Fall. The most common shape: Business Analysts write requirements (Water) → an agile delivery team (Scrum) → a specialist deployment / compliance / hardware integration step (Fall) before the customer sees it.':
		'Water-Scrum-Fall es el *patrón observado* en TI empresarial regulada: fuertes requisitos iniciales (Water), un medio con Scrum o Kanban, y trabajo especializado final (Fall). Larman & Vodde lo documentaron como la situación típica anti-LeSS, y la realidad práctica de la mayoría de las empresas de TI. *No* es un marco en el sentido prescriptivo, sino un *patrón* que el equipo debe aceptar antes de poder reducir el Water o el Fall.'
};

for (const [en, es] of Object.entries(translations)) {
	dict[en] = es;
}

fs.writeFileSync('scripts/es-dict.json', JSON.stringify(dict, null, 2));
console.log('Translated successfully!');
