import type { Params } from './types';
import type { Translations } from './en';

export const es: Translations = {
	common: {
		save: 'Guardar',
		discard: 'Descartar',
		close: 'Cerrar',
		cancel: 'Cancelar',
		refresh: 'Actualizar',
		clear: 'Limpiar',
		forget: 'Olvidar',
		review: 'Revisar',
		dismiss: 'Descartar',
		ok: 'Aceptar',
		apply: 'Aplicar',
		back: 'Atrás',
		next: 'Siguiente',
		loading: 'Cargando…',
		empty: 'Vacío',
		justNow: 'ahora mismo',
		all: 'Todos',
		required: 'requerido',
		delete: 'Eliminar',
		permanentDelete: 'eliminar permanentemente',
		trashDirectory: '.quill.md/.trash/',
		remoteSessionExpired: 'Sesión remota expirada — inicia sesión nuevamente para actualizar.',
		issueCount: (params: Params) => `${params.n} elemento${params.n === 1 ? '' : 's'}`,
		dirtyCount: (params: Params) => `${params.n} sin guardar`,
		validationErrors: (params: Params) =>
			`${params.n} error${params.n === 1 ? '' : 'es'} de validación`,
		integrityReview: (params: Params) =>
			`${params.n} advertencia${params.n === 1 ? '' : 's'} de integridad`,
		fullscreen: 'Pantalla completa'
	},

	app: {
		name: 'Quill.md',
		version: 'v0.0.1',
		homeAria: 'inicio de quill.md',
		logoAlt: 'logo de quill.md'
	},

	modeBadge: {
		local: 'Local',
		remote: 'Remoto (solo lectura)',
		setup: 'Configuración',
		home: 'Inicio',
		firstRunSetup: 'Configuración inicial'
	},

	topbar: {
		remoteRepository: 'Repositorio remoto',
		settingsTooltip: 'Ajustes',
		openSettings: 'Abrir ajustes',
		toggleMobileNav: 'Alternar menú móvil',
		ariaLabel: 'Navegación principal'
	},

	leftrail: {
		ariaLabel: 'Navegación',
		viewsHeading: 'Vistas',
		trackersHeading: 'Categorías',
		planningHeading: 'Planificación',
		filtersHeading: 'Filtros',
		view: {
			list: 'Lista',
			kanban: 'Kanban',
			gantt: 'Gantt',
			graph: 'Grafo',
			tree: 'Árbol',
			backlog: 'Backlog',
			sprint: 'Planificador Sprint'
		},
		expandNav: 'Expandir navegación',
		collapseNav: 'Contraer navegación',
		integrityBadge: (params: Params) =>
			`${params.n} advertencia${params.n === 1 ? '' : 's'} de integridad`,
		integrityReview: (params: Params) =>
			`Revisar ${params.n} advertencia${params.n === 1 ? '' : 's'} de integridad`,
		integrityAria: (params: Params) =>
			`${params.n} advertencia${params.n === 1 ? '' : 's'} de integridad — revisar`
	},

	integrity: {
		bannerBody: (params: Params) =>
			`${params.n} archivo${params.n === 1 ? '' : 's'} modificado fuera de quill.md — revisa antes de guardar.`,
		editorWarning:
			'Este archivo fue modificado fuera de quill.md. Revisa el contenido antes de guardar — el id, relaciones y marcadores de sección podrían haber cambiado.',
		dismissAria: 'Ocultar advertencia de integridad'
	},

	home: {
		heroTitle: 'quill.md',
		heroSubtitle: 'La gestión que viaja con tu repositorio',
		chooseModeAria: 'Elige un modo',
		openLocalTitle: 'Abrir una carpeta local',
		openLocalBody:
			'Elige una carpeta en tu máquina para editar elementos guardados en .quill.md/. Requiere un navegador basado en Chromium.',
		openLocalButton: 'Abrir carpeta local',
		openRemoteTitle: 'Explorar un repositorio remoto',
		openRemoteBody: 'Acceso de solo lectura a elementos alojados en cualquier proveedor de Git.',
		openRemoteButton: 'Abrir remoto',
		remoteUrlPlaceholder: 'https://github.com/owner/repo',
		remoteBranchPlaceholder: 'main',
		remotePatLabel: 'Personal Access Token (opcional para repos públicos)',
		remotePatPlaceholder: 'ghp_…',
		remotePatHelp: 'Guardado en memoria solo durante la sesión — nunca en disco, nunca en URLs.',
		fsaUnavailable:
			'Tu navegador no soporta la File System Access API. Usa Chrome, Edge, Brave, Arc, Opera, o Vivaldi para el Modo de Edición Local.',

		recentFolders: {
			title: 'Carpetas recientes',
			lastOpenedAgo: (params: Params) => `Última vez abierto ${params.label}`,
			forgetLabel: (params: Params) => `Olvidar ${params.name}`
		},

		howItWorks: {
			title: 'Cómo funciona',
			pickFolder: {
				title: 'Elige una carpeta',
				body: 'Abre una carpeta en tu máquina que ya tenga (o vaya a tener) un directorio .quill.md/.'
			},
			browse: {
				title: 'Explora tus elementos',
				body: 'Ve la lista, vista kanban, o diagrama de gantt de cada elemento. Filtra, busca, y abre uno para leerlo.'
			},
			edit: {
				title: 'Edita y guarda',
				body: 'Cambia un título, ajusta un estado o escribe una nueva sección. Se guarda directamente en la carpeta que elegiste.'
			}
		}
	},

	localToolbar: {
		newIssue: '+ Nuevo',
		importIssue: 'Importar .md',
		importIssueFailed: (params: Params) => `Error al importar: ${params.msg}`,
		refresh: '↻ Refrescar',
		refreshReadOnlyTooltip: 'Solo lectura — cierra sesión para editar localmente',
		trashButton: (params: Params) => `Papelera (${params.n})`,
		trashEmptyLabel: 'Vacía',
		trashAria: (params: Params) =>
			`La papelera contiene ${params.n} archivo${params.n === 1 ? '' : 's'}. Clic para vaciar.`
	},

	remoteToolbar: {
		view: (params: Params) => `${params.n} elemento${params.n === 1 ? '' : 's'} (solo lectura)`,
		signOut: 'Cerrar sesión',
		lastFetchedAria: (params: Params) => `Última sincronización ${params.label}`,
		lastFetched: (params: Params) => `Última sincronización: ${params.label}`,
		notYetFetched: 'No sincronizado aún',
		dismissErrorAria: 'Ocultar error'
	},

	refreshPatPrompt: {
		title: 'Actualizar remoto',
		body: 'El árbol remoto se volverá a descargar. Proporciona un Personal Access Token para que el proxy pueda autenticarse. El token solo se mantiene en memoria.',
		label: 'Personal Access Token',
		refreshing: 'Actualizando…',
		closeAria: 'Cerrar'
	},

	newIssueModal: {
		title: 'Nuevo elemento',
		closeAria: 'Cerrar diálogo de nuevo elemento',
		searchPlaceholder: 'Buscar tipos…',
		noMatch: (params: Params) => `Ningún tipo coincide con "${params.q}".`,
		fieldCount: (params: Params) => `${params.n} campo${params.n === 1 ? '' : 's'}`,
		sectionCount: (params: Params) => `${params.n} sección${params.n === 1 ? 'es' : ''}`,
		selectType: (params: Params) => `Seleccionar ${params.name}`,
		create: 'Crear'
	},

	emptyTrashModal: {
		title: '¿Vaciar papelera?',
		closeAria: 'Cerrar diálogo de vaciar papelera',
		alreadyEmpty: 'La papelera ya está vacía.',
		confirmBody: (params: Params) =>
			`Esto eliminará permanentemente ${params.n} archivo${params.n === 1 ? '' : 's'} de .quill.md/.trash/. Esta acción no se puede deshacer.`,
		confirm: 'Vaciar papelera'
	},

	editor: {
		tabs: {
			form: 'Formulario',
			write: 'Escribir',
			preview: 'Vista previa'
		},
		closeAria: 'Cerrar editor',
		sectionsAria: 'Secciones',
		noSectionsEdit: 'No hay secciones para editar.',
		noSectionsPreview: 'No hay secciones para previsualizar.',
		readOnlySaveTooltip: 'Solo lectura — abre localmente para guardar',
		readOnlyDiscardTooltip: 'Solo lectura — abre localmente para descartar',
		deleteTooltip: 'Mover a papelera',
		unsaved: 'Cambios sin guardar',
		footerClose: 'Cerrar'
	},

	formFields: {
		issueTypeDisabledNote:
			'El tipo de elemento no se puede cambiar después de creado — crea uno nuevo en su lugar.',
		assigneePlaceholder: 'Sin asignar',
		selectPlaceholder: 'Seleccionar…',
		noIssues: 'No hay elementos',
		changeTypeTitle: '¿Cambiar tipo de elemento?',
		changeTypeBody: (params: Params) =>
			`Cambiar de "${params.old}" a "${params.new}" recargará el editor con la nueva plantilla. Los cambios no guardados se perderán.`,
		changeTypeConfirm: 'Cambiar tipo',
		changeTypeCancel: 'Cancelar',
		changeTypeAria: (params: Params) => `Confirmar cambio de ${params.old} a ${params.new}`,
		relationTypes: {
			parent: 'Padre',
			child: 'Hijo',
			blocks: 'Bloquea a',
			depends_on: 'Depende de',
			relates_to: 'Relacionado con'
		},
		addRelation: 'Añadir relación',
		removeRelationAria: 'Eliminar relación'
	},

	markdown: {
		previewAria: 'Línea de tiempo Gantt',
		renderFailed: '<p class="text-error">Error al renderizar la vista previa.</p>'
	},

	settings: {
		title: 'Ajustes',
		closeAria: 'Cerrar ajustes',
		backdropAria: 'Cerrar ajustes',
		themeHeading: 'Tema',
		themeLight: 'Claro',
		themeDark: 'Oscuro',
		themeSystem: 'Sistema',
		themeSystemHint: (params: Params) => `Siguiendo la preferencia del OS (${params.now} ahora).`,
		languageHeading: 'Idioma',
		languageEn: 'English',
		languageEs: 'Español',
		corsHeading: 'Proxy CORS',
		corsPlaceholder: '(no configurado)',
		corsNote: 'Editar este valor requiere re-guardar tu config.json. Próximamente.',
		recentHeading: 'Carpetas recientes',
		commandsHeading: 'Comandos',
		clearCache: 'Limpiar caché remota',
		clearCacheBusy: 'Limpiando…',
		clearCacheDone: 'Caché limpia. La próxima actualización descargará el árbol nuevamente.',
		clearCacheError: (params: Params) => `Error al limpiar caché: ${params.message}`,
		clearCacheRemoteTooltip: 'Limpiar el clon remoto en caché para este repositorio',
		clearCacheSignInTooltip: 'Inicia sesión en un repositorio remoto para habilitar esto',
		emptyTrash: (params: Params) =>
			`Vaciar papelera${Number(params.n) > 0 ? ` (${params.n})` : ''}`,
		emptyTrashLocalTooltip: 'Vaciar la carpeta local .quill.md/.trash/',
		emptyTrashSignInTooltip: 'Abre una carpeta local para habilitar esto',
		templatesHeading: 'Categorías (Plantillas)',
		newTemplate: '+ Nueva'
	},

	list: {
		countPill: (params: Params) =>
			`${params.filtered} de ${params.total} elemento${params.total === 1 ? '' : 's'}`,
		sortLabel: (params: Params) => `Ordenar: ${params.key} (${params.dir})`,
		rowAria: (params: Params) => `Abrir elemento ${params.id}: ${params.title}`,
		empty: 'No hay elementos que coincidan con el filtro actual.',
		headers: {
			id: 'id',
			title: 'título',
			type: 'tipo',
			status: 'estado',
			assignee: 'asignado a',
			labels: 'etiquetas',
			updated: 'actualizado'
		}
	},

	kanban: {
		cardAria: (params: Params) => `Elemento ${params.id}: ${params.title} en columna ${params.col}`,
		readOnlyTooltip: 'Solo lectura — abre este elemento localmente para cambiar su estado',
		pickedUp: (params: Params) =>
			`Elemento ${params.id} recogido. Usa las flechas para mover, Espacio o Enter para soltar, Escape para cancelar.`,
		dropped: (params: Params) => `Elemento ${params.id} soltado en columna ${params.col}`,
		cancelled: (params: Params) => `Movimiento cancelado para el elemento ${params.id}.`,
		activateHint: 'Presiona F2 para abrir el editor'
	},

	gantt: {
		emptyTitle: 'Aún no hay elementos programados',
		emptyBody: 'Añade fechas de inicio y fin a los elementos en el Editor para verlos en el Gantt.',
		ariaLabel: 'Línea de tiempo Gantt',
		roleDescription: 'línea de tiempo gantt',
		barAria: (params: Params) => `Elemento ${params.id}: ${params.title}`,
		barDescription: (params: Params) =>
			`Estado ${params.status}, tipo ${params.type}, grupo ${params.group}. ` +
			`Inicia ${params.start ?? 'desconocido'}, ` +
			(params.end ? `termina ${params.end}.` : `duración ${params.duration ?? '?'} días.`),
		truncation: '…',
		fallbackSummary: 'Respaldo textual (accesibilidad NFR-4)',
		fallbackEmpty: 'No hay elementos que coincidan con el filtro actual.',
		fallbackNotScheduled: 'No programado',
		fallbackHeaders: {
			id: 'id',
			title: 'título',
			type: 'tipo',
			status: 'estado',
			group: 'grupo',
			start: 'inicio',
			endOrDuration: 'fin / duración'
		},
		duration: (params: Params) => `${params.n} d`
	},

	filter: {
		searchLabel: 'Buscar',
		searchPlaceholder: 'título o cuerpo de sección…',
		statusLabel: 'Estado',
		typeLabel: 'Tipo',
		typePlaceholder: 'bug, tarea…',
		clearButton: 'Limpiar'
	},

	theme: {
		switchToLight: 'Cambiar a tema claro',
		switchToDark: 'Cambiar a tema oscuro'
	},

	proxy: {
		dismissAria: 'Ocultar advertencia de proxy'
	},

	wizard: {
		headTitle: 'Configura tu proyecto',
		headBody:
			'Tu carpeta aún no tiene una configuración .quill.md/. Elige una ruta abajo para comenzar. Puedes editar o agregar plantillas más tarde desde Ajustes.',
		step1Title: '1. Elige cómo configurar plantillas',
		step2Title: '2. Elige un framework',
		step2Body:
			'Selecciona uno de los 20 frameworks estándar de la industria. Se instalará el conjunto completo de categorías y estados.',
		builtinTitle: 'Usar un framework',
		builtinBody:
			'Elige de entre los frameworks ágiles como Scrum, Kanban, XP, o SAFe. Recomendado para la mayoría.',
		builtinAria: 'Usar un framework',
		customTitle: 'Crear la tuya propia',
		customBody:
			'Crea tu propia categoría desde cero usando el nuevo Editor Visual. Define los íconos, colores y campos que necesites.',
		customAria: 'Crear tus propias plantillas',
		customTooltip: 'Próximamente — el editor de plantillas en la app es un paso futuro',
		applyButton: 'Aplicar y continuar',
		applyTooltip: 'Escribir el framework seleccionado en .quill.md/',
		applyTooltipDisabled: 'Selecciona un framework para continuar',
		applying: 'Aplicando…',
		cancel: 'Cancelar',
		noFolder: 'No hay carpeta local abierta. Usa "Abrir carpeta local" en el inicio.',
		applyError: (params: Params) => `Error al escribir la configuración: ${params.msg}`,
		selectFrameworkAria: (params: Params) => `Seleccionar framework ${params.name}`,
		frameworkIncludes: (params: Params) =>
			`Incluye ${params.templates} plantillas · ${params.statuses} estados`
	},
	sprint: {
		progress: 'Progreso del Sprint',
		stories: 'Historias',
		points: 'Puntos de Historia',
		progressLabel: 'Progreso',
		pointsUnit: 'pts'
	},
	backlogView: {
		tabEpic: 'Por Epic',
		tabUseCase: 'Por Caso de Uso',
		unparented: 'Historias Sin Clasificar',
		noStories: 'No hay historias en este grupo.'
	},
	sprintPlanner: {
		selectSprint: 'Selecciona un Sprint para planificar',
		unlink: 'Desvincular',
		linkStory: 'Vincular Historia',
		noUnassigned: '¡Todas las historias de usuario están asignadas a Sprints!',
		unassignedHeader: 'Historias de Usuario Sin Asignar',
		storiesInSprint: 'Historias en Sprint',
		noSprints: 'Aún no hay Sprints creados. ¡Crea un elemento Sprint para empezar!',
		emptySprint: 'Este sprint no tiene historias. ¡Vincula algunas abajo!',
		readyToPlan: 'Listo para Planificar',
		needsRefinement: 'Requiere Refinamiento (Falta Epic)',
		linkDisabledTooltip:
			'Esta historia debe estar vinculada a una Epic antes de poder asignarse a un Sprint.'
	},
	templateEditor: {
		preview: 'Vista Previa',
		unnamed: 'Categoría Sin Nombre',
		fieldsBadge: 'Campos',
		basicInfo: 'Información Básica',
		nameLabel: 'Nombre de la Categoría',
		idLabel: 'ID del Sistema',
		idHint: 'Identificador único en disco (solo minúsculas y guiones).',
		appearance: 'Apariencia Visual',
		icon: 'Ícono Representativo',
		color: 'Color de Énfasis',
		customColor: 'Color Personalizado',
		fieldsTitle: 'Campos de Datos',
		fieldsSubtitle: 'Atributos específicos que quieres registrar para este tipo de elemento.',
		addField: 'Añadir Campo',
		fieldName: 'Nombre del Campo',
		fieldType: 'Tipo de Dato',
		required: 'Obligatorio',
		key: 'Key',
		options: 'Opciones del Selector',
		optionsHint: 'Ingresa las opciones separadas por coma.',
		noFields: 'No has añadido ningún campo dinámico todavía.',
		sectionsTitle: 'Bloques de Contenido',
		sectionsSubtitle: 'Secciones de texto largo o descripciones que conforman el elemento.',
		addSection: 'Añadir Sección',
		types: {
			text: 'Texto Corto',
			longtext: 'Texto Largo',
			date: 'Fecha',
			number: 'Número',
			select: 'Selección Única',
			'multi-select': 'Selección Múltiple',
			user: 'Usuario',
			relations: 'Relaciones'
		},
		typesHelp: 'Información de tipos de dato',
		typesHelpText:
			'• Texto Corto: Para nombres o títulos cortos.\n• Texto Largo: Para descripciones o detalles extensos.\n• Fecha: Selector de calendario.\n• Número: Cantidades, estimaciones o métricas.\n• Selección Única/Múltiple: Etiquetas y categorías predefinidas.\n• Usuario: Asignar a miembros del equipo.\n• Relaciones: Bloqueos o dependencias con otros elementos.',
		basicHelp: '¿Qué es la información básica?',
		basicHelpText:
			'El Nombre es cómo verás tu categoría en los menús (ej. "Caso de Uso"). El ID del Sistema es el identificador único en disco; se usa internamente y no debe cambiar una vez creado.',
		appearanceHelp: '¿Para qué sirve la apariencia?',
		appearanceHelpText:
			'El ícono y el color permitirán identificar visualmente los elementos de esta categoría en los tableros Kanban, diagramas Gantt y listas.',
		fieldsHelp: '¿Qué son los campos de datos?',
		fieldsHelpText:
			'Los campos son propiedades específicas (metadatos) que quieres registrar para este elemento (ej. Prioridad, Puntos de Esfuerzo, o Fecha Límite). Aparecerán en el panel derecho del elemento.',
		sectionsHelp: '¿Qué son los bloques de contenido?',
		sectionsHelpText:
			'Son las áreas principales de texto libre donde puedes escribir Markdown. Útiles para secciones como "Criterios de Aceptación", "Contexto" o "Pasos para reproducir". Aparecerán en el cuerpo central del elemento.',
		loadExample: 'Cargar Ejemplo Muestra',
		example: {
			name: 'Incidente Crítico',
			f1: 'Prioridad',
			f2: 'Fecha del Evento',
			f3: 'Reportado Por',
			f4: 'Sistemas Afectados',
			s1: 'Descripción del Fallo',
			s2: 'Pasos para Reproducir',
			s3: 'Plan de Mitigación'
		},
		relationsConfig: 'Restricciones de Relación',
		allowedTargets: 'Categorías Permitidas',
		allowedTargetsHint: 'Si no marcas ninguna, se permitirá vincular con cualquier elemento.',
		allowedRelationTypes: 'Tipos de Relación Permitidos',
		allowedRelationTypesHint:
			'Si no marcas ninguno, se permitirán todos los tipos (Padre, Hijo, Bloquea, etc.).'
	}
};
