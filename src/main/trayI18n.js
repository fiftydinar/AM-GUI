let currentLocale = 'en';

const trayLabels = {
  fr: { open: 'Ouvrir AM-GUI', quit: 'Quitter' },
  en: { open: 'Open AM-GUI', quit: 'Quit' },
  it: { open: 'Apri AM-GUI', quit: 'Esci' },
  cs: { open: 'Otevřít AM-GUI', quit: 'Ukončit' },
  es: { open: 'Abrir AM-GUI', quit: 'Salir' },
  pt: { open: 'Abrir AM-GUI', quit: 'Sair' },
  sr: { open: 'Otvori AM-GUI', quit: 'Izađi' }
};

const contextMenuLabels = {
  fr: { undo: 'Défaire', redo: 'Refaire', cut: 'Couper', copy: 'Copier', paste: 'Coller', del: 'Supprimer', selectAll: 'Tout sélectionner', toggleDevTools: 'Outils de développement' },
  en: { undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', del: 'Delete', selectAll: 'Select All', toggleDevTools: 'Toggle Developer Tools' },
  it: { undo: 'Annulla', redo: 'Ripeti', cut: 'Taglia', copy: 'Copia', paste: 'Incolla', del: 'Elimina', selectAll: 'Seleziona tutto', toggleDevTools: 'Strumenti di sviluppo' },
  cs: { undo: 'Zpět', redo: 'Znovu', cut: 'Vyjmout', copy: 'Kopírovat', paste: 'Vložit', del: 'Smazat', selectAll: 'Vybrat vše', toggleDevTools: 'Nástroje pro vývojáře' },
  es: { undo: 'Deshacer', redo: 'Rehacer', cut: 'Cortar', copy: 'Copiar', paste: 'Pegar', del: 'Eliminar', selectAll: 'Seleccionar todo', toggleDevTools: 'Herramientas de desarrollo' },
  pt: { undo: 'Desfazer', redo: 'Refazer', cut: 'Cortar', copy: 'Copiar', paste: 'Colar', del: 'Eliminar', selectAll: 'Selecionar tudo', toggleDevTools: 'Ferramentas de desenvolvimento' },
  sr: { undo: 'Poništi', redo: 'Ponovi', cut: 'Iseci', copy: 'Kopiraj', paste: 'Nalepi', del: 'Obriši', selectAll: 'Izaberi sve', toggleDevTools: 'Alatke za programere' }
};

const mainErrorLabels = {
  fr: {
    errNoPm: "Aucun gestionnaire de paquets 'am' ou 'appman' trouvé",
    errNoPmPath: "Aucun gestionnaire de paquets 'am' ou 'appman' détecté dans le PATH.",
    errUnknown: 'Erreur inconnue',
    errMissingId: 'Identifiant manquant',
    errProcessNotFound: 'Processus introuvable',
    errMissingPm: 'missing-pm',
    errInvalidApp: 'invalid-app',
    errSandboxFailed: 'Échec de la commande sandbox.',
    errForbiddenPath: 'forbidden-path',
    errMissingPath: 'missing-path',
    errUnableStartSandbox: 'Impossible de démarrer la commande sandbox.',
    errSandboxPtyClosed: 'PTY sandbox fermé (EIO)',
    errInvalidUrl: 'URL invalide',
    errSchemeNotAllowed: 'Schéma non autorisé',
    errProcessFinishedCode: 'Processus terminé avec le code {code}',
    errUnknownAction: 'Action inconnue : {action}',
    errInvalidName: 'Nom invalide',
    errUnableStartProcess: 'Impossible de démarrer le processus.',
    errProcessError: 'Erreur du processus',
    errCancellationFailed: 'Échec de l\'annulation',
    errUnableStartUpdate: 'Impossible de démarrer la mise à jour.',
    errMissingIdShort: 'missing-id',
    errNotFound: 'not-found',
    errInvalidChoice: 'Choix invalide',
    errFailedSendChoice: 'Échec de l\'envoi du choix',
    errAppmanInstall: 'Échec de l\'installation d\'AppMan.',
    errListExecFailed: 'Échec de l\'exécution de la commande de liste.',
    errInternalParsing: 'Erreur d\'analyse interne.',
    errMissingDependency: 'missing-dependency',
    errSandboxConfigureFailed: 'sandbox-configure-failed',
    errSandboxDisableFailed: 'sandbox-disable-failed',
    errGitHubRequest: 'Erreur de requête GitHub : {msg}',
    errNoCategories: 'Aucune catégorie trouvée',
    errDownloadFailed: 'Échec du téléchargement (HTTP {status})'
  },
  en: {
    errNoPm: "No 'am' or 'appman' package manager found",
    errNoPmPath: "No 'am' or 'appman' package manager detected in PATH.",
    errUnknown: 'Unknown error',
    errMissingId: 'Missing ID',
    errProcessNotFound: 'Process not found',
    errMissingPm: 'missing-pm',
    errInvalidApp: 'invalid-app',
    errSandboxFailed: 'Sandbox command failed.',
    errForbiddenPath: 'forbidden-path',
    errMissingPath: 'missing-path',
    errUnableStartSandbox: 'Unable to start sandbox command.',
    errSandboxPtyClosed: 'Sandbox PTY closed (EIO)',
    errInvalidUrl: 'invalid url',
    errSchemeNotAllowed: 'scheme not allowed',
    errProcessFinishedCode: 'Process finished with code {code}',
    errUnknownAction: 'Unknown action: {action}',
    errInvalidName: 'Invalid name',
    errUnableStartProcess: 'Unable to start the process.',
    errProcessError: 'Process error',
    errCancellationFailed: 'Cancellation failed',
    errUnableStartUpdate: 'Unable to start the update.',
    errMissingIdShort: 'missing-id',
    errNotFound: 'not-found',
    errInvalidChoice: 'Invalid choice',
    errFailedSendChoice: 'Failed to send choice',
    errAppmanInstall: 'AppMan installation failed.',
    errListExecFailed: 'List command execution failed.',
    errInternalParsing: 'Internal parsing error.',
    errMissingDependency: 'missing-dependency',
    errSandboxConfigureFailed: 'sandbox-configure-failed',
    errSandboxDisableFailed: 'sandbox-disable-failed',
    errGitHubRequest: 'GitHub request error: {msg}',
    errNoCategories: 'No categories found',
    errDownloadFailed: 'Download failed (HTTP {status})'
  },
  it: {
    errNoPm: "Nessun gestore pacchetti 'am' o 'appman' trovato",
    errNoPmPath: "Nessun gestore pacchetti 'am' o 'appman' rilevato nel PATH.",
    errUnknown: 'Errore sconosciuto',
    errMissingId: 'ID mancante',
    errProcessNotFound: 'Processo non trovato',
    errMissingPm: 'missing-pm',
    errInvalidApp: 'invalid-app',
    errSandboxFailed: 'Comando sandbox fallito.',
    errForbiddenPath: 'forbidden-path',
    errMissingPath: 'missing-path',
    errUnableStartSandbox: 'Impossibile avviare il comando sandbox.',
    errSandboxPtyClosed: 'PTY sandbox chiuso (EIO)',
    errInvalidUrl: 'URL non valido',
    errSchemeNotAllowed: 'Schema non consentito',
    errProcessFinishedCode: 'Processo terminato con codice {code}',
    errUnknownAction: 'Azione sconosciuta: {action}',
    errInvalidName: 'Nome non valido',
    errUnableStartProcess: 'Impossibile avviare il processo.',
    errProcessError: 'Errore del processo',
    errCancellationFailed: 'Annullamento fallito',
    errUnableStartUpdate: 'Impossibile avviare l\'aggiornamento.',
    errMissingIdShort: 'missing-id',
    errNotFound: 'not-found',
    errInvalidChoice: 'Scelta non valida',
    errFailedSendChoice: 'Invio della scelta fallito',
    errAppmanInstall: 'Installazione AppMan fallita.',
    errListExecFailed: 'Esecuzione del comando di elenco fallita.',
    errInternalParsing: 'Errore di analisi interno.',
    errMissingDependency: 'missing-dependency',
    errSandboxConfigureFailed: 'sandbox-configure-failed',
    errSandboxDisableFailed: 'sandbox-disable-failed',
    errGitHubRequest: 'Errore richiesta GitHub: {msg}',
    errNoCategories: 'Nessuna categoria trovata',
    errDownloadFailed: 'Download fallito (HTTP {status})'
  },
  cs: {
    errNoPm: "Nebyl nalezen správce balíčků 'am' nebo 'appman'",
    errNoPmPath: "Správce balíčků 'am' nebo 'appman' nebyl detekován v PATH.",
    errUnknown: 'Neznámá chyba',
    errMissingId: 'Chybějící ID',
    errProcessNotFound: 'Proces nenalezen',
    errMissingPm: 'missing-pm',
    errInvalidApp: 'invalid-app',
    errSandboxFailed: 'Příkaz sandboxu selhal.',
    errForbiddenPath: 'forbidden-path',
    errMissingPath: 'missing-path',
    errUnableStartSandbox: 'Nelze spustit příkaz sandboxu.',
    errSandboxPtyClosed: 'PTY sandboxu uzavřen (EIO)',
    errInvalidUrl: 'neplatná URL',
    errSchemeNotAllowed: 'schéma není povoleno',
    errProcessFinishedCode: 'Proces dokončen s kódem {code}',
    errUnknownAction: 'Neznámá akce: {action}',
    errInvalidName: 'Neplatný název',
    errUnableStartProcess: 'Nelze spustit proces.',
    errProcessError: 'Chyba procesu',
    errCancellationFailed: 'Zrušení selhalo',
    errUnableStartUpdate: 'Nelze spustit aktualizaci.',
    errMissingIdShort: 'missing-id',
    errNotFound: 'not-found',
    errInvalidChoice: 'Neplatná volba',
    errFailedSendChoice: 'Odeslání volby selhalo',
    errAppmanInstall: 'Instalace AppManu selhala.',
    errListExecFailed: 'Provádění příkazu seznamu selhalo.',
    errInternalParsing: 'Interní chyba analýzy.',
    errMissingDependency: 'missing-dependency',
    errSandboxConfigureFailed: 'sandbox-configure-failed',
    errSandboxDisableFailed: 'sandbox-disable-failed',
    errGitHubRequest: 'Chyba požadavku GitHub: {msg}',
    errNoCategories: 'Nenalezeny žádné kategorie',
    errDownloadFailed: 'Stahování selhalo (HTTP {status})'
  },
  es: {
    errNoPm: "No se encontró el gestor de paquetes 'am' o 'appman'",
    errNoPmPath: "No se detectó el gestor de paquetes 'am' o 'appman' en PATH.",
    errUnknown: 'Error desconocido',
    errMissingId: 'ID faltante',
    errProcessNotFound: 'Proceso no encontrado',
    errMissingPm: 'missing-pm',
    errInvalidApp: 'invalid-app',
    errSandboxFailed: 'El comando sandbox falló.',
    errForbiddenPath: 'forbidden-path',
    errMissingPath: 'missing-path',
    errUnableStartSandbox: 'No se puede iniciar el comando sandbox.',
    errSandboxPtyClosed: 'PTY de sandbox cerrado (EIO)',
    errInvalidUrl: 'URL no válida',
    errSchemeNotAllowed: 'Esquema no permitido',
    errProcessFinishedCode: 'Proceso finalizado con código {code}',
    errUnknownAction: 'Acción desconocida: {action}',
    errInvalidName: 'Nombre no válido',
    errUnableStartProcess: 'No se puede iniciar el proceso.',
    errProcessError: 'Error del proceso',
    errCancellationFailed: 'Cancelación fallida',
    errUnableStartUpdate: 'No se puede iniciar la actualización.',
    errMissingIdShort: 'missing-id',
    errNotFound: 'not-found',
    errInvalidChoice: 'Opción no válida',
    errFailedSendChoice: 'Error al enviar la opción',
    errAppmanInstall: 'Instalación de AppMan fallida.',
    errListExecFailed: 'Ejecución del comando de lista fallida.',
    errInternalParsing: 'Error de análisis interno.',
    errMissingDependency: 'missing-dependency',
    errSandboxConfigureFailed: 'sandbox-configure-failed',
    errSandboxDisableFailed: 'sandbox-disable-failed',
    errGitHubRequest: 'Error de solicitud a GitHub: {msg}',
    errNoCategories: 'No se encontraron categorías',
    errDownloadFailed: 'Descarga fallida (HTTP {status})'
  },
  pt: {
    errNoPm: "Nenhum gerenciador de pacotes 'am' ou 'appman' encontrado",
    errNoPmPath: "Nenhum gerenciador de pacotes 'am' ou 'appman' detectado no PATH.",
    errUnknown: 'Erro desconhecido',
    errMissingId: 'ID faltando',
    errProcessNotFound: 'Processo não encontrado',
    errMissingPm: 'missing-pm',
    errInvalidApp: 'invalid-app',
    errSandboxFailed: 'Comando sandbox falhou.',
    errForbiddenPath: 'forbidden-path',
    errMissingPath: 'missing-path',
    errUnableStartSandbox: 'Não foi possível iniciar o comando sandbox.',
    errSandboxPtyClosed: 'PTY do sandbox fechado (EIO)',
    errInvalidUrl: 'URL inválida',
    errSchemeNotAllowed: 'Esquema não permitido',
    errProcessFinishedCode: 'Processo finalizado com código {code}',
    errUnknownAction: 'Ação desconhecida: {action}',
    errInvalidName: 'Nome inválido',
    errUnableStartProcess: 'Não foi possível iniciar o processo.',
    errProcessError: 'Erro do processo',
    errCancellationFailed: 'Cancelamento falhou',
    errUnableStartUpdate: 'Não foi possível iniciar a atualização.',
    errMissingIdShort: 'missing-id',
    errNotFound: 'not-found',
    errInvalidChoice: 'Escolha inválida',
    errFailedSendChoice: 'Falha ao enviar escolha',
    errAppmanInstall: 'Instalação do AppMan falhou.',
    errListExecFailed: 'Execução do comando de lista falhou.',
    errInternalParsing: 'Erro de análise interno.',
    errMissingDependency: 'missing-dependency',
    errSandboxConfigureFailed: 'sandbox-configure-failed',
    errSandboxDisableFailed: 'sandbox-disable-failed',
    errGitHubRequest: 'Erro na solicitação ao GitHub: {msg}',
    errNoCategories: 'Nenhuma categoria encontrada',
    errDownloadFailed: 'Download falhou (HTTP {status})'
  },
  sr: {
    errNoPm: "Nije pronađen menadžer paketa 'am' ili 'appman'",
    errNoPmPath: "Menadžer paketa 'am' ili 'appman' nije detektovan u PATH-u.",
    errUnknown: 'Nepoznata greška',
    errMissingId: 'Nedostaje ID',
    errProcessNotFound: 'Proces nije pronađen',
    errMissingPm: 'missing-pm',
    errInvalidApp: 'invalid-app',
    errSandboxFailed: 'Sandbox komanda nije uspela.',
    errForbiddenPath: 'forbidden-path',
    errMissingPath: 'missing-path',
    errUnableStartSandbox: 'Nije moguće pokrenuti sandbox komandu.',
    errSandboxPtyClosed: 'Sandbox PTY zatvoren (EIO)',
    errInvalidUrl: 'nevažeći URL',
    errSchemeNotAllowed: 'šema nije dozvoljena',
    errProcessFinishedCode: 'Proces završen sa kodom {code}',
    errUnknownAction: 'Nepoznata radnja: {action}',
    errInvalidName: 'Nevažeće ime',
    errUnableStartProcess: 'Nije moguće pokrenuti proces.',
    errProcessError: 'Greška procesa',
    errCancellationFailed: 'Otkazivanje nije uspelo',
    errUnableStartUpdate: 'Nije moguće pokrenuti ažuriranje.',
    errMissingIdShort: 'missing-id',
    errNotFound: 'not-found',
    errInvalidChoice: 'Nevažeći izbor',
    errFailedSendChoice: 'Slanje izbora nije uspelo',
    errAppmanInstall: 'Instalacija AppMan-a nije uspela.',
    errListExecFailed: 'Izvršavanje komande liste nije uspelo.',
    errInternalParsing: 'Interna greška pri parsiranju.',
    errMissingDependency: 'missing-dependency',
    errSandboxConfigureFailed: 'sandbox-configure-failed',
    errSandboxDisableFailed: 'sandbox-disable-failed',
    errGitHubRequest: 'Greška pri GitHub zahtevu: {msg}',
    errNoCategories: 'Nema pronađenih kategorija',
    errDownloadFailed: 'Preuzimanje nije uspelo (HTTP {status})'
  }
};

const fallback = trayLabels.en;
const fallbackCtx = contextMenuLabels.en;
const fallbackErr = mainErrorLabels.en;

function getTrayLabels(locale) {
  if (!locale || locale === 'auto') return fallback;
  const base = locale.slice(0, 2);
  return trayLabels[base] || fallback;
}

function getContextMenuLabels(locale) {
  if (!locale || locale === 'auto') return fallbackCtx;
  const base = locale.slice(0, 2);
  return contextMenuLabels[base] || fallbackCtx;
}

function getMainErrorLabels(locale) {
  if (!locale || locale === 'auto') return fallbackErr;
  const base = locale.slice(0, 2);
  return mainErrorLabels[base] || fallbackErr;
}

function applyVars(str, vars) {
  if (!vars) return str;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return str;
}

function tErr(key, fallbackStr, vars) {
  const locale = currentLocale;
  const labels = getMainErrorLabels(locale);
  let str = labels[key];
  if (str === undefined || str === null) str = fallbackStr;
  return applyVars(str, vars);
}

function setLocale(locale) {
  if (locale && locale !== 'auto') currentLocale = locale;
}

module.exports = { getTrayLabels, getContextMenuLabels, tErr, setLocale };
