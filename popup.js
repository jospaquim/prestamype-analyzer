// Constantes para la aplicación
const CONSTANTS = {
    CURRENCIES: {
        PEN: { symbol: 'S/', name: 'Soles', minInvestment: 100 },
        USD: { symbol: '$', name: 'Dólares', minInvestment: 25 }
    },
    EXCHANGE_RATE: 3.7, // PEN por USD aproximado
    RISK_LEVELS: ['A', 'B', 'C', 'D', 'E'],
    DEFAULT_CONFIG: {
        budget: 200,
        minReturn: 8,
        maxRisk: 'B',
        currency: 'PEN'
    }
};

// Clase para manejar la configuración siguiendo el principio de responsabilidad única
class ConfigurationManager {
    constructor() {
        this.config = { ...CONSTANTS.DEFAULT_CONFIG };
    }

    async load() {
        const result = await chrome.storage.local.get(['analyzer_config']);
        if (result.analyzer_config) {
            this.config = { ...this.config, ...result.analyzer_config };
        }
        return this.config;
    }

    async save(newConfig) {
        this.config = { ...this.config, ...newConfig };
        await chrome.storage.local.set({ analyzer_config: this.config });
    }

    get() {
        return { ...this.config };
    }

    getCurrencyInfo() {
        return CONSTANTS.CURRENCIES[this.config.currency];
    }

    convertToPEN(amount) {
        return this.config.currency === 'USD' ? amount * CONSTANTS.EXCHANGE_RATE : amount;
    }

    convertFromPEN(amount) {
        return this.config.currency === 'USD' ? amount / CONSTANTS.EXCHANGE_RATE : amount;
    }
}

// Clase para manejar la lógica de inversión y distribución de presupuesto
class InvestmentCalculator {
    constructor(configManager) {
        this.configManager = configManager;
    }

    // Calcular distribución óptima de inversión
    calculateInvestmentDistribution(opportunities) {
        const config = this.configManager.get();
        const currencyInfo = this.configManager.getCurrencyInfo();
        const availableBudget = this.configManager.convertToPEN(config.budget);

        const validOpportunities = opportunities.filter(opp =>
            this._isValidForInvestment(opp, config)
        );

        if (validOpportunities.length === 0) {
            return [];
        }

        // Ordenar por score descendente
        validOpportunities.sort((a, b) => b.score - a.score);

        const distributions = [];
        let remainingBudget = availableBudget;
        const minInvestmentPEN = currencyInfo.minInvestment === 100 ? 100 : 25 * CONSTANTS.EXCHANGE_RATE;

        for (const opportunity of validOpportunities) {
            if (remainingBudget < minInvestmentPEN) break;

            const investment = this._calculateOptimalInvestment(
                opportunity,
                remainingBudget,
                minInvestmentPEN
            );

            if (investment > 0) {
                const investmentInUserCurrency = this.configManager.convertFromPEN(investment);
                const expectedReturn = this._calculateExpectedReturn(opportunity, investment);
                const expectedReturnInUserCurrency = this.configManager.convertFromPEN(expectedReturn);

                distributions.push({
                    opportunity,
                    investment: investmentInUserCurrency,
                    investmentPEN: investment,
                    expectedReturn: expectedReturnInUserCurrency,
                    expectedReturnPEN: expectedReturn,
                    percentage: Math.min(100, (investment / opportunity.amount) * 100)
                });

                remainingBudget -= investment;
            }
        }

        return distributions;
    }

    // Verificar si la oportunidad es válida para inversión
    _isValidForInvestment(opportunity, config) {
        // Verificar rentabilidad mínima
        if (opportunity.return < config.minReturn) return false;

        // Verificar riesgo máximo
        const riskIndex = CONSTANTS.RISK_LEVELS.indexOf(opportunity.risk);
        const maxRiskIndex = CONSTANTS.RISK_LEVELS.indexOf(config.maxRisk);
        if (riskIndex > maxRiskIndex) return false;

        return true;
    }

    // Calcular inversión óptima para una oportunidad
    _calculateOptimalInvestment(opportunity, remainingBudget, minInvestment) {
        const maxPossibleInvestment = Math.min(
            remainingBudget,
            opportunity.amount * (100 - opportunity.progress) / 100 // Cantidad no financiada
        );

        if (maxPossibleInvestment < minInvestment) return 0;

        // Estrategia: invertir un porcentaje basado en el score
        const scoreRatio = opportunity.score / 100;
        const budgetRatio = Math.min(0.5, scoreRatio * 0.7); // Máximo 50% del presupuesto restante

        const strategicInvestment = remainingBudget * budgetRatio;
        const optimalInvestment = Math.min(strategicInvestment, maxPossibleInvestment);

        // Redondear al múltiplo de inversión mínima más cercano
        return Math.floor(optimalInvestment / minInvestment) * minInvestment;
    }

    // Calcular retorno esperado
    _calculateExpectedReturn(opportunity, investment) {
        const annualReturn = opportunity.return / 100;
        const daysTerm = opportunity.term || 90; // Defecto 90 días
        const periodReturn = annualReturn * (daysTerm / 365);

        return investment * periodReturn;
    }

    // Generar recomendaciones textuales
    generateRecommendations(distributions) {
        if (distributions.length === 0) {
            return ['No se encontraron oportunidades que cumplan tus criterios de inversión.'];
        }

        const recommendations = [];
        const config = this.configManager.get();
        const totalInvestment = distributions.reduce((sum, d) => sum + d.investment, 0);
        const totalReturn = distributions.reduce((sum, d) => sum + d.expectedReturn, 0);

        recommendations.push(
            `💰 Distribución recomendada: ${distributions.length} oportunidad${distributions.length > 1 ? 'es' : ''}`
        );

        recommendations.push(
            `📊 Inversión total: ${this._formatAmount(totalInvestment, config.currency)} de ${this._formatAmount(config.budget, config.currency)}`
        );

        recommendations.push(
            `📈 Retorno esperado: ${this._formatAmount(totalReturn, config.currency)} (${((totalReturn / totalInvestment) * 100).toFixed(2)}%)`
        );

        if (distributions.length === 1) {
            recommendations.push('🎯 Estrategia: Inversión concentrada en la mejor oportunidad');
        } else {
            recommendations.push('🎯 Estrategia: Diversificación entre las mejores oportunidades');
        }

        return recommendations;
    }

    _formatAmount(amount, currency) {
        const currencyInfo = CONSTANTS.CURRENCIES[currency];
        return `${currencyInfo.symbol}${amount.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
}

// Clase para manejar la UI siguiendo el principio de responsabilidad única
class UIManager {
    constructor(configManager) {
        this.configManager = configManager;
        this.elements = {};
        this.isConfigCollapsed = false;
    }

    initialize() {
        this._bindElements();
        this._setupEventListeners();
        this._updateCurrencyDisplay();
    }

    _bindElements() {
        this.elements = {
            configBtn: document.getElementById('configBtn'),
            configModal: document.getElementById('configModal'),
            modalClose: document.getElementById('modalClose'),
            saveConfig: document.getElementById('saveConfig'),
            currency: document.getElementById('currency'),
            currencySymbol: document.querySelector('.currency-symbol'),
            budget: document.getElementById('budget'),
            minReturn: document.getElementById('minReturn'),
            maxRisk: document.getElementById('maxRisk'),
            analyzeBtn: document.getElementById('analyzeBtn'),
            clearBtn: document.getElementById('clearBtn'),
            results: document.getElementById('results'),
            loading: document.getElementById('loading'),
            error: document.getElementById('error'),
            summary: document.getElementById('summary'),
            recommendations: document.getElementById('recommendations'),
            opportunitiesList: document.getElementById('opportunitiesList')
        };
    }

    _setupEventListeners() {
        this.elements.configBtn.addEventListener('click', () => this.openModal());
        this.elements.modalClose.addEventListener('click', () => this.closeModal());
        this.elements.saveConfig.addEventListener('click', () => this.saveAndCloseModal());
        this.elements.configModal.addEventListener('click', (e) => {
            if (e.target === this.elements.configModal) {
                this.closeModal();
            }
        });
        this.elements.currency.addEventListener('change', () => this._updateCurrencyDisplay());
    }

    openModal() {
        this.elements.configModal.classList.remove('hidden');
    }

    closeModal() {
        this.elements.configModal.classList.add('hidden');
    }

    async saveAndCloseModal() {
        await this._saveConfiguration();
        this.closeModal();
    }

    _updateCurrencyDisplay() {
        const currency = this.elements.currency.value;
        const currencyInfo = CONSTANTS.CURRENCIES[currency];

        this.elements.currencySymbol.textContent = currencyInfo.symbol;
        this.elements.budget.min = currencyInfo.minInvestment;
        this.elements.budget.placeholder = currency === 'PEN' ? '10000' : '2700';

        this._saveConfiguration();
    }

    async _saveConfiguration() {
        const config = {
            budget: parseFloat(this.elements.budget.value) || CONSTANTS.DEFAULT_CONFIG.budget,
            minReturn: parseFloat(this.elements.minReturn.value) || CONSTANTS.DEFAULT_CONFIG.minReturn,
            maxRisk: this.elements.maxRisk.value || CONSTANTS.DEFAULT_CONFIG.maxRisk,
            currency: this.elements.currency.value || CONSTANTS.DEFAULT_CONFIG.currency
        };

        await this.configManager.save(config);
    }

    updateFromConfig(config) {
        this.elements.budget.value = config.budget;
        this.elements.minReturn.value = config.minReturn;
        this.elements.maxRisk.value = config.maxRisk;
        this.elements.currency.value = config.currency;
        this._updateCurrencyDisplay();
    }

    showLoading(show) {
        this.elements.loading.classList.toggle('hidden', !show);
        this.elements.results.classList.toggle('hidden', show);
    }

    showError(message) {
        this.elements.error.classList.remove('hidden');
        this.elements.error.innerHTML = `<p>❌ ${message}</p>`;
    }

    hideError() {
        this.elements.error.classList.add('hidden');
    }

    clearResults() {
        this.elements.results.classList.add('hidden');
        this.elements.summary.innerHTML = '';
        this.elements.recommendations.innerHTML = '';
        this.elements.opportunitiesList.innerHTML = '';
        this.hideError();
    }

    displayResults(opportunities, investmentCalculator) {
        this.elements.results.classList.remove('hidden');

        this.displaySummary(opportunities);
        this.displayRecommendations(opportunities, investmentCalculator);
        this.displayOpportunities(opportunities);
    }

    // Mostrar resumen
    displaySummary(opportunities) {
        const total = opportunities.length;
        const excellent = opportunities.filter(o => o.score >= 80).length;
        const good = opportunities.filter(o => o.score >= 60 && o.score < 80).length;
        const avgScore = opportunities.reduce((sum, o) => sum + (o.score || 0), 0) / total;
        const avgReturn = opportunities.reduce((sum, o) => sum + (o.return || 0), 0) / total;

        this.elements.summary.innerHTML = `
            <div class="summary-item">
                <span class="summary-label">Total oportunidades:</span>
                <span class="summary-value">${total}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Score promedio:</span>
                <span class="summary-value">${avgScore.toFixed(1)}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Rentabilidad promedio:</span>
                <span class="summary-value">${avgReturn.toFixed(2)}%</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Excelentes:</span>
                <span class="summary-value">${excellent} (${(excellent/total*100).toFixed(1)}%)</span>
            </div>
        `;
    }

    // Mostrar recomendaciones
    displayRecommendations(opportunities, investmentCalculator) {
        const distributions = investmentCalculator.calculateInvestmentDistribution(opportunities);
        const recommendations = investmentCalculator.generateRecommendations(distributions);

        this.elements.recommendations.innerHTML = recommendations
            .map(rec => `<div class="recommendation-item">${rec}</div>`)
            .join('');
    }

    // Mostrar lista de oportunidades
    displayOpportunities(opportunities) {
        const html = opportunities.map(opp => this._createOpportunityCard(opp)).join('');
        this.elements.opportunitiesList.innerHTML = html;
    }

    // Crear tarjeta HTML para oportunidad
    _createOpportunityCard(opportunity) {
        const config = this.configManager.get();
        const currencyInfo = this.configManager.getCurrencyInfo();
        const scoreClass = opportunity.score >= 80 ? 'score-excellent' :
                          opportunity.score >= 60 ? 'score-good' : 'score-fair';

        // Calcular simulación de inversión con el presupuesto del usuario
        const simulation = this._calculateInvestmentSimulation(opportunity, config);

        return `
            <div class="opportunity-card">
                <div class="opportunity-header">
                    <div class="title-section">
                        <h4 class="opportunity-title">${opportunity.title || 'Sin título'}</h4>
                        <div class="currency-info">
                            <span class="currency-badge">💰 ${opportunity.currency || 'PEN'} ${simulation.paymentGuaranteed ? '🛡️' : ''}</span>
                        </div>
                    </div>
                    <span class="score-badge ${scoreClass}">${opportunity.score}</span>
                </div>

                <div class="opportunity-body">
                    <!-- Simulación de inversión personalizada -->
                    <div class="primary-metrics">
                        <div class="primary-metric">
                            <div class="metric-value">${currencyInfo.symbol}${simulation.potentialInvestment.toFixed(0)}</div>
                            <div class="metric-label">Puedes invertir</div>
                        </div>
                        <div class="primary-metric">
                            <div class="metric-value">+${currencyInfo.symbol}${simulation.potentialGain.toFixed(0)}</div>
                            <div class="metric-label">Ganancia</div>
                        </div>
                        <div class="primary-metric">
                            <div class="metric-value">${simulation.daysToMaturity}</div>
                            <div class="metric-label">Días</div>
                        </div>
                    </div>

                    <!-- Información de la inversión -->
                    <div class="financial-details">
                        <div class="detail-row">
                            <span class="detail-label">👥 Inversores actuales:</span>
                            <span class="detail-value">${simulation.estimatedInvestors} persona${simulation.estimatedInvestors !== 1 ? 's' : ''}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">📅 Te pagan el:</span>
                            <span class="detail-value">${simulation.paymentDate}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">🎯 Mayor inversión:</span>
                            <span class="detail-value">${currencyInfo.symbol}${simulation.averageTicket.toFixed(0)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">⚠️ Estado crediticio:</span>
                            <span class="detail-value ${simulation.creditStatus.class}">${simulation.creditStatus.text}</span>
                        </div>
                        ${simulation.remainingTime ? `
                        <div class="detail-row">
                            <span class="detail-label">⏰ Tiempo restante:</span>
                            <span class="detail-value urgent">${simulation.remainingTime}</span>
                        </div>
                        ` : ''}
                    </div>

                    ${simulation.advice ? `
                    <div class="investment-advice ${simulation.advice.urgency}">
                        <p class="advice-text">${simulation.advice.message}</p>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Calcular simulación de inversión personalizada
    _calculateInvestmentSimulation(opportunity, config) {
        const currencyInfo = this.configManager.getCurrencyInfo();

        // Calcular días hasta vencimiento - validar datos
        const daysToMaturity = this._calculateDaysToMaturity(opportunity.estimatedPayment);

        // Usar datos reales si están disponibles, sino calcular con validaciones
        const amount = parseFloat(opportunity.amount) || 0;
        const progress = parseFloat(opportunity.progress) || 0;
        const returnRate = parseFloat(opportunity.return) || 0;

        const raisedAmount = opportunity.raisedAmount || (amount * progress / 100);
        const availableAmount = opportunity.remainingAmount || (amount * (100 - progress) / 100);

        // Determinar cuánto puede invertir el usuario - validar presupuesto
        const userBudget = parseFloat(config.budget) || currencyInfo.minInvestment;
        const potentialInvestment = Math.max(currencyInfo.minInvestment, Math.min(userBudget * 0.15, availableAmount, currencyInfo.minInvestment * 50));

        // Usar retorno mensual real si está disponible - validar cálculos
        const monthlyRate = opportunity.monthlyReturn ? (parseFloat(opportunity.monthlyReturn) / 100) : (returnRate / 100 / 12);
        const potentialGain = potentialInvestment * monthlyRate * (daysToMaturity / 30);

        // Usar número real de inversores si está disponible
        const estimatedInvestors = opportunity.totalInvestors || Math.max(1, Math.ceil(raisedAmount / currencyInfo.minInvestment));

        // Usar máxima inversión real o calcular ticket promedio
        const averageTicket = opportunity.maxInvestment || Math.max(currencyInfo.minInvestment, (raisedAmount > 0 ? raisedAmount / estimatedInvestors : currencyInfo.minInvestment));

        // Fecha de pago formateada con validación
        const paymentDate = this._formatDate(opportunity.estimatedPayment);

        // Estado crediticio basado en el riesgo con garantía
        const creditStatus = this._getCreditStatus(opportunity.risk, opportunity.paymentGuaranteed);

        // Consejo de inversión
        const advice = this._generateSimulationAdvice(opportunity, potentialInvestment, availableAmount);

        return {
            potentialInvestment: isFinite(potentialInvestment) ? potentialInvestment : currencyInfo.minInvestment,
            potentialGain: isFinite(potentialGain) ? potentialGain : 0,
            daysToMaturity: isFinite(daysToMaturity) ? daysToMaturity : 0,
            estimatedInvestors,
            paymentDate,
            averageTicket: isFinite(averageTicket) ? averageTicket : currencyInfo.minInvestment,
            creditStatus,
            advice,
            auctionCode: opportunity.auctionCode,
            remainingTime: opportunity.remainingTime,
            paymentGuaranteed: opportunity.paymentGuaranteed
        };
    }

    // Calcular días hasta vencimiento
    _calculateDaysToMaturity(estimatedPayment) {
        if (!estimatedPayment) return 0;

        try {
            const paymentDate = new Date(estimatedPayment);
            const today = new Date();
            const diffTime = paymentDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return Math.max(0, diffDays);
        } catch {
            return 0;
        }
    }

    // Obtener estado crediticio basado en riesgo y garantías
    _getCreditStatus(risk, paymentGuaranteed = false) {
        const riskMap = {
            'A': { text: 'Excelente', class: 'credit-excellent' },
            'B': { text: 'Bueno', class: 'credit-good' },
            'C': { text: 'Regular', class: 'credit-fair' },
            'D': { text: 'Alto riesgo', class: 'credit-poor' },
            'E': { text: 'Muy arriesgado', class: 'credit-bad' }
        };

        const baseStatus = riskMap[risk] || { text: 'No disponible', class: 'credit-unknown' };

        if (paymentGuaranteed) {
            return {
                text: baseStatus.text + ' (Garantizado)',
                class: baseStatus.class + ' guaranteed'
            };
        }

        return baseStatus;
    }

    // Generar consejo de inversión para simulación
    _generateSimulationAdvice(opportunity, potentialInvestment, availableAmount) {
        const progress = opportunity.progress || 0;
        const daysToClose = this._calculateDaysToClose(opportunity.auctionClose);

        if (daysToClose <= 1) {
            return {
                message: '⏰ ¡Cierra pronto! Invierte ahora antes que se agote.',
                urgency: 'urgency-critical'
            };
        }

        if (progress > 85) {
            return {
                message: '🔥 Casi completado. Solo queda poco disponible.',
                urgency: 'urgency-high'
            };
        }

        if (potentialInvestment < availableAmount * 0.01) {
            return {
                message: '💡 Podrías aumentar tu inversión en esta oportunidad.',
                urgency: 'urgency-normal'
            };
        }

        return {
            message: '✅ Buena oportunidad para diversificar tu portafolio.',
            urgency: 'urgency-normal'
        };
    }

    // Calcular días hasta cierre
    _calculateDaysToClose(auctionClose) {
        if (!auctionClose) return 999;

        try {
            const closeDate = new Date(auctionClose);
            const today = new Date();
            const diffTime = closeDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return Math.max(0, diffDays);
        } catch {
            return 999;
        }
    }

    // Formatear tiempo de cierre
    _formatClosingTime(auctionClose) {
        if (!auctionClose) return 'No disponible';

        try {
            const closeDate = new Date(auctionClose);
            const now = new Date();
            const diffHours = Math.ceil((closeDate - now) / (1000 * 60 * 60));

            if (diffHours <= 0) return 'Cerrado';
            if (diffHours < 24) return `${diffHours}h restantes`;
            const diffDays = Math.ceil(diffHours / 24);
            return `${diffDays}d restantes`;
        } catch {
            return 'No disponible';
        }
    }

    // Verificar si es cierre urgente
    _isUrgentClose(auctionClose) {
        if (!auctionClose) return false;

        try {
            const closeDate = new Date(auctionClose);
            const now = new Date();
            const diffHours = (closeDate - now) / (1000 * 60 * 60);
            return diffHours <= 6; // Menos de 6 horas
        } catch {
            return false;
        }
    }

    // Formatear fecha
    _formatDate(dateString) {
        if (!dateString || dateString === 'Invalid Date') return 'No disponible';

        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'No disponible';

            return date.toLocaleDateString('es-PE', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        } catch {
            return 'No disponible';
        }
    }

    // Generar consejo de inversión
    _generateInvestmentAdvice(opportunity, config, availableAmount, minInvestment) {
        if (availableAmount < minInvestment) {
            return {
                type: 'warning',
                icon: '⚠️',
                title: 'Sin disponibilidad',
                message: 'No hay suficiente monto disponible para invertir'
            };
        }

        if (opportunity.score >= 85) {
            return {
                type: 'excellent',
                icon: '🏆',
                title: 'Oportunidad excepcional',
                message: 'Combina alta rentabilidad con riesgo controlado'
            };
        }

        if (opportunity.score >= 70) {
            return {
                type: 'good',
                icon: '⭐',
                title: 'Buena oportunidad',
                message: 'Rentabilidad atractiva dentro de tus criterios'
            };
        }

        if (opportunity.return < config.minReturn) {
            return {
                type: 'warning',
                icon: '📉',
                title: 'Rentabilidad baja',
                message: `Menor a tu mínimo del ${config.minReturn}%`
            };
        }

        return {
            type: 'neutral',
            icon: '📊',
            title: 'Evaluar cuidadosamente',
            message: 'Revisa todos los factores antes de decidir'
        };
    }

    // Formatear moneda
    _formatCurrency(amount, currency = 'PEN') {
        const currencyInfo = CONSTANTS.CURRENCIES[currency] || CONSTANTS.CURRENCIES['PEN'];
        return `${currencyInfo.symbol}${amount.toLocaleString('es-PE', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        })}`;
    }
}

// Popup script con sistema de scoring y recomendaciones
class PrestamypeAnalyzer {
    constructor() {
        this.opportunities = [];
        this.configManager = new ConfigurationManager();
        this.uiManager = new UIManager(this.configManager);
        this.investmentCalculator = new InvestmentCalculator(this.configManager);
        this.initialize();
    }

    async initialize() {
        this.uiManager.initialize();
        await this.loadConfiguration();
        this._setupAnalyzeButton();
        this._setupClearButton();
    }

    async loadConfiguration() {
        const config = await this.configManager.load();
        this.uiManager.updateFromConfig(config);
    }

    _setupAnalyzeButton() {
        this.uiManager.elements.analyzeBtn.addEventListener('click', () => this.analyzeOpportunities());
    }

    _setupClearButton() {
        this.uiManager.elements.clearBtn.addEventListener('click', () => this.uiManager.clearResults());
    }


    // Función principal de análisis
    async analyzeOpportunities() {
        this.uiManager.showLoading(true);
        this.uiManager.hideError();

        try {
            // Obtener pestaña activa
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('prestamype.com')) {
                throw new Error('Esta extensión solo funciona en Prestamype.com');
            }

            // Inyectar content script si es necesario
            await this.ensureContentScriptInjected(tab.id);

            // Extraer datos de la página con timeout y retry
            const response = await this.extractDataWithRetry(tab.id, 3);
            
            if (!response.success) {
                throw new Error(response.error || 'Error extrayendo datos');
            }

            console.log('🔍 Respuesta completa recibida:', response);
            console.log('📦 response.data:', response.data);
            console.log('📏 tipo de response.data:', typeof response.data);

            this.opportunities = response.data || [];
            console.log('🎯 this.opportunities asignado:', this.opportunities);
            console.log('📊 Analizando', this.opportunities?.length || 'undefined', 'oportunidades');

            if (this.opportunities.length === 0) {
                throw new Error('No se encontraron oportunidades en la página. Asegúrate de estar en la página principal de oportunidades.');
            }

            // Calcular scores y generar recomendaciones
            this.calculateScores();
            this.uiManager.displayResults(this.opportunities, this.investmentCalculator);

            // Guardar en storage para análisis posterior
            await this.saveAnalysisResults();

        } catch (error) {
            console.error('❌ Error en análisis:', error);
            this.uiManager.showError(this.getErrorMessage(error));
        } finally {
            this.uiManager.showLoading(false);
        }
    }

    // Calcular scores para cada oportunidad
    calculateScores() {
        if (!this.opportunities || !Array.isArray(this.opportunities)) {
            console.error('❌ this.opportunities no es un array válido:', this.opportunities);
            this.opportunities = [];
            return;
        }

        const config = this.configManager.get();
        this.opportunities.forEach(opp => {
            opp.score = this.calculateOpportunityScore(opp);
            opp.recommendation = this.generateRecommendation(opp, config);
            opp.fitsBudget = (opp.minInvestment || 0) <= config.budget;
            opp.meetsReturn = (opp.return || 0) >= config.minReturn;
            opp.acceptableRisk = this.isAcceptableRisk(opp.risk, config.maxRisk);
        });

        // Ordenar por score descendente
        this.opportunities.sort((a, b) => b.score - a.score);
    }

    // Calcular score individual de oportunidad
    calculateOpportunityScore(opportunity) {
        const config = this.configManager.get();
        let score = 0;
        let maxScore = 100;

        // 1. Rentabilidad (40% del score)
        const returnScore = this.calculateReturnScore(opportunity.return, config);
        score += returnScore * 0.4;

        // 2. Riesgo (25% del score)
        const riskScore = this.calculateRiskScore(opportunity.risk, config);
        score += riskScore * 0.25;

        // 3. Liquidez/Plazo (15% del score)
        const termScore = this.calculateTermScore(opportunity.term);
        score += termScore * 0.15;

        // 4. Progreso de financiación (10% del score)
        const progressScore = this.calculateProgressScore(opportunity.progress);
        score += progressScore * 0.1;

        // 5. Accesibilidad (10% del score)
        const accessibilityScore = this.calculateAccessibilityScore(opportunity, config);
        score += accessibilityScore * 0.1;

        // Bonificaciones y penalizaciones
        score = this.applyBonusesAndPenalties(score, opportunity, config);

        return Math.round(Math.max(0, Math.min(maxScore, score)));
    }

    // Calcular score de rentabilidad
    calculateReturnScore(returnRate, config) {
        if (!returnRate) return 0;

        const minAcceptable = config.minReturn;
        const excellent = minAcceptable + 8; // +8% sobre mínimo es excelente

        if (returnRate < minAcceptable) {
            return Math.max(0, (returnRate / minAcceptable) * 50);
        } else if (returnRate >= excellent) {
            return 100;
        } else {
            return 50 + ((returnRate - minAcceptable) / (excellent - minAcceptable)) * 50;
        }
    }

    // Calcular score de riesgo
    calculateRiskScore(risk, config) {
        if (!risk) return 50;

        const riskValues = { 'A': 100, 'B': 85, 'C': 70, 'D': 50, 'E': 25 };
        const baseScore = riskValues[risk] || 50;

        // Ajustar según preferencias del usuario
        const userMaxRisk = config.maxRisk;
        const userRiskValues = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5 };

        const oppRiskLevel = userRiskValues[risk] || 3;
        const maxRiskLevel = userRiskValues[userMaxRisk] || 3;
        
        if (oppRiskLevel <= maxRiskLevel) {
            return baseScore;
        } else {
            // Penalizar riesgos superiores al máximo aceptable
            return Math.max(0, baseScore - (oppRiskLevel - maxRiskLevel) * 20);
        }
    }

    // Calcular score de plazo
    calculateTermScore(term) {
        if (!term) return 50;
        
        // Términos más cortos son generalmente preferibles para liquidez
        if (term <= 6) return 100;      // Menos de 6 meses
        if (term <= 12) return 85;      // 6-12 meses
        if (term <= 24) return 70;      // 1-2 años
        if (term <= 36) return 55;      // 2-3 años
        return 40;                      // Más de 3 años
    }

    // Calcular score de progreso
    calculateProgressScore(progress) {
        if (typeof progress !== 'number') return 50;
        
        // Preferir oportunidades con progreso medio (ni muy poco ni demasiado)
        if (progress >= 20 && progress <= 80) return 100;
        if (progress >= 10 && progress < 20) return 80;
        if (progress > 80 && progress <= 90) return 80;
        if (progress > 90) return 60;  // Casi financiado, menos tiempo
        return 40;                     // Muy poco progreso
    }

    // Calcular score de accesibilidad
    calculateAccessibilityScore(opportunity, config) {
        let score = 50;

        // Bonificar si está dentro del presupuesto
        if (opportunity.fitsBudget) {
            score += 30;
        }

        // Bonificar inversiones mínimas bajas
        const minInv = opportunity.minInvestment || 50;
        if (minInv <= 100) score += 20;
        else if (minInv <= 500) score += 10;
        else if (minInv > 5000) score -= 10;

        return Math.max(0, Math.min(100, score));
    }

    // Aplicar bonificaciones y penalizaciones
    applyBonusesAndPenalties(score, opportunity, config) {
        // Bonificación por cumplir todos los criterios
        if (opportunity.fitsBudget && opportunity.meetsReturn && opportunity.acceptableRisk) {
            score *= 1.1; // +10% bonus
        }

        // Penalización por no cumplir criterios básicos
        if (!opportunity.meetsReturn) score *= 0.8;
        if (!opportunity.acceptableRisk) score *= 0.7;
        if (!opportunity.fitsBudget) score *= 0.9;

        // Bonificación por categorías preferidas (ejemplo)
        if (opportunity.category === 'inmobiliario') {
            score *= 1.05; // +5% para inmobiliario
        }

        return score;
    }

    // Verificar si el riesgo es aceptable
    isAcceptableRisk(risk, maxRisk) {
        if (!risk) return true;

        const riskLevels = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5 };
        const oppLevel = riskLevels[risk] || 3;
        const maxLevel = riskLevels[maxRisk] || 3;

        return oppLevel <= maxLevel;
    }

    // Generar recomendación para oportunidad
    generateRecommendation(opportunity, config) {
        const issues = [];
        const strengths = [];

        // Analizar fortalezas y debilidades
        if (opportunity.return >= config.minReturn + 3) {
            strengths.push('Excelente rentabilidad');
        } else if (opportunity.return < config.minReturn) {
            issues.push('Rentabilidad por debajo del mínimo');
        }

        if (['A', 'B'].includes(opportunity.risk)) {
            strengths.push('Riesgo bajo');
        } else if (['D', 'E'].includes(opportunity.risk)) {
            issues.push('Riesgo elevado');
        }

        if (opportunity.term <= 12) {
            strengths.push('Plazo corto');
        } else if (opportunity.term > 36) {
            issues.push('Plazo muy largo');
        }

        if (!opportunity.fitsBudget) {
            issues.push('Fuera de presupuesto');
        }

        // Generar recomendación
        if (opportunity.score >= 80) {
            return {
                level: 'high',
                text: 'Muy recomendada',
                reasons: strengths.slice(0, 2)
            };
        } else if (opportunity.score >= 60) {
            return {
                level: 'medium',
                text: 'Recomendada con reservas',
                reasons: [...strengths.slice(0, 1), ...issues.slice(0, 1)]
            };
        } else {
            return {
                level: 'low',
                text: 'No recomendada',
                reasons: issues.slice(0, 2)
            };
        }
    }

    // Mostrar resultados
    displayResults() {
        this.elements.results.classList.remove('hidden');
        
        this.displaySummary();
        this.displayRecommendations();
        this.displayOpportunities();
    }

    // Mostrar resumen
    displaySummary() {
        const total = this.opportunities.length;
        const recommended = this.opportunities.filter(o => o.score >= 60).length;
        const withinBudget = this.opportunities.filter(o => o.fitsBudget).length;
        const avgReturn = this.opportunities.reduce((sum, o) => sum + (o.return || 0), 0) / total;
        
        this.elements.summary.innerHTML = `
            <div class="summary-item">
                <span class="summary-label">Total oportunidades:</span>
                <span class="summary-value">${total}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Recomendadas:</span>
                <span class="summary-value">${recommended}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Dentro del presupuesto:</span>
                <span class="summary-value">${withinBudget}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Rentabilidad promedio:</span>
                <span class="summary-value">${avgReturn.toFixed(1)}%</span>
            </div>
        `;
    }

    // Mostrar recomendaciones generales
    displayRecommendations() {
        const topOpportunities = this.opportunities.filter(o => o.score >= 80).slice(0, 3);
        const recommendations = [];
        
        if (topOpportunities.length > 0) {
            recommendations.push(`✅ ${topOpportunities.length} oportunidades excelentes encontradas`);
        }
        
        const withinBudget = this.opportunities.filter(o => o.fitsBudget && o.score >= 60).length;
        if (withinBudget > 0) {
            recommendations.push(`💰 ${withinBudget} oportunidades recomendadas dentro de tu presupuesto`);
        }
        
        const lowRisk = this.opportunities.filter(o => ['A', 'B'].includes(o.risk) && o.score >= 60).length;
        if (lowRisk > 0) {
            recommendations.push(`🛡️ ${lowRisk} oportunidades de bajo riesgo recomendadas`);
        }
        
        if (recommendations.length === 0) {
            recommendations.push('⚠️ Considera ajustar tus criterios para encontrar más oportunidades');
        }
        
        this.elements.recommendations.innerHTML = recommendations
            .map(rec => `<div class="recommendation-item">${rec}</div>`)
            .join('');
    }

    // Mostrar lista de oportunidades
    displayOpportunities() {
        const html = this.opportunities.map(opp => this.createOpportunityCard(opp)).join('');
        this.elements.opportunitiesList.innerHTML = html;
    }

    // Crear tarjeta de oportunidad
    createOpportunityCard(opportunity) {
        const scoreClass = opportunity.score >= 80 ? 'high' : opportunity.score >= 60 ? 'medium' : 'low';
        const riskClass = `risk-${opportunity.risk || 'C'}`;
        
        return `
            <div class="opportunity-card">
                <div class="opportunity-header">
                    <div class="opportunity-title">${opportunity.title}</div>
                    <div class="opportunity-score score-${scoreClass}">${opportunity.score}/100</div>
                </div>
                <div class="opportunity-details">
                    <div class="detail-item">
                        <span class="detail-label">Rentabilidad:</span>
                        <span class="detail-value">${opportunity.return ? opportunity.return.toFixed(1) + '%' : 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Riesgo:</span>
                        <span class="detail-value ${riskClass}">${opportunity.risk || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Importe:</span>
                        <span class="detail-value">${this.formatAmount(opportunity.amount)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Plazo:</span>
                        <span class="detail-value">${opportunity.term ? opportunity.term + ' meses' : 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Mín. inversión:</span>
                        <span class="detail-value">${this.formatAmount(opportunity.minInvestment)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Progreso:</span>
                        <span class="detail-value">${opportunity.progress ? opportunity.progress.toFixed(0) + '%' : 'N/A'}</span>
                    </div>
                </div>
                <div class="opportunity-recommendation">
                    <strong>${opportunity.recommendation.text}</strong>
                    ${opportunity.recommendation.reasons.length > 0 ? 
                        `<br><small>${opportunity.recommendation.reasons.join(', ')}</small>` : ''
                    }
                </div>
            </div>
        `;
    }

    // Asegurar que content script está inyectado
    async ensureContentScriptInjected(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
        } catch (error) {
            // Content script ya está inyectado o error menor
            console.log('Content script ya disponible o error menor:', error.message);
        }
    }

    // Extraer datos con reintento
    async extractDataWithRetry(tabId, maxRetries = 3) {
        let lastError = null;
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                console.log(`🔄 Intento ${i + 1} de extracción de datos...`);
                
                const response = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Timeout esperando respuesta'));
                    }, 10000); // 10 segundos timeout
                    
                    chrome.tabs.sendMessage(tabId, { action: 'extractData' }, (response) => {
                        clearTimeout(timeout);
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    });
                });
                
                if (response && response.success) {
                    return response;
                }
                
                lastError = new Error(response?.error || 'Respuesta inválida');
                
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Intento ${i + 1} falló:`, error.message);
                
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Esperar más cada intento
                }
            }
        }
        
        throw lastError || new Error('Todos los intentos de extracción fallaron');
    }

    // Guardar resultados del análisis
    async saveAnalysisResults() {
        try {
            const analysisData = {
                timestamp: Date.now(),
                opportunities: this.opportunities.slice(0, 10), // Guardar solo las top 10
                config: this.config,
                summary: {
                    total: this.opportunities.length,
                    recommended: this.opportunities.filter(o => o.score >= 60).length,
                    withinBudget: this.opportunities.filter(o => o.fitsBudget).length
                }
            };
            
            await chrome.storage.local.set({ last_analysis: analysisData });
        } catch (error) {
            console.warn('⚠️ Error guardando análisis:', error);
        }
    }

    // Obtener mensaje de error amigable
    getErrorMessage(error) {
        const errorMessages = {
            'Timeout esperando respuesta': 'La página tardó demasiado en responder. Intenta recargar la página.',
            'Could not establish connection': 'No se pudo conectar con la página. Recarga la página e intenta nuevamente.',
            'The extensions message port is closed': 'Conexión perdida. Recarga la página e intenta nuevamente.',
            'No se encontraron oportunidades': 'No se encontraron oportunidades en esta página. Navega a la página principal de oportunidades de Prestamype.'
        };
        
        const message = error.message || error.toString();
        
        for (const [key, value] of Object.entries(errorMessages)) {
            if (message.includes(key)) {
                return value;
            }
        }
        
        return message;
    }

    // Formatear cantidades
    formatAmount(amount) {
        if (!amount || isNaN(amount)) return 'N/A';
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0
        }).format(amount);
    }

    // Limpiar resultados
    clearResults() {
        this.uiManager.clearResults();
        this.opportunities = [];
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new PrestamypeAnalyzer();
});