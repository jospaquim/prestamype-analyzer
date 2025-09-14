// Content script para extraer datos de Prestamype
class PrestamypeExtractor {
    constructor() {
        this.opportunities = [];
        this.isExtracting = false;

        // Constantes
        this.EXTRACTION_TIMEOUT = 15000;
        this.MIN_INVESTMENT_DEFAULT = 100;
        this.MAX_PROGRESS = 100;
        this.MIN_PROGRESS = 0;
        this.DAYS_IN_YEAR = 365;
    }

    // Función principal para extraer datos de la tabla (versión simplificada)
    extractTableData() {
        console.log('🔍 Iniciando extracción de datos de Prestamype...');

        try {
            this._validatePageState();

            // Extraer datos solo de la página actual por ahora
            this.opportunities = [];
            const pageOpportunities = this._extractCurrentPageDataSync();
            this.opportunities.push(...pageOpportunities);

            console.log(`✅ Extraídas ${this.opportunities.length} oportunidades de la página actual`);

            if (this.opportunities.length === 0) {
                throw new Error('No se pudieron extraer datos válidos de la página actual.');
            }

            return this.opportunities;

        } catch (error) {
            console.error('❌ Error en la extracción:', error);
            throw error;
        }
    }

    // Validar estado de la página
    _validatePageState() {
        const loadingMessage = document.querySelector('.loadingMessage');
        if (loadingMessage && loadingMessage.style.display !== 'none') {
            throw new Error('La página aún está cargando oportunidades. Espera unos segundos e intenta nuevamente.');
        }

        const noDataMessage = document.querySelector('.notFoundMessage');
        if (noDataMessage && noDataMessage.parentElement.style.display !== 'none') {
            throw new Error('No hay oportunidades disponibles en este momento.');
        }
    }

    // Extraer datos de todas las páginas disponibles
    async _extractAllPages() {
        const initialPage = this._getCurrentPageNumber();
        console.log(`📄 Página inicial: ${initialPage}`);

        let currentPage = 1;
        let hasMorePages = true;

        while (hasMorePages) {
            console.log(`📄 Extrayendo página ${currentPage}...`);

            // Navegar a la página si no es la primera
            if (currentPage > 1) {
                const navigated = await this._navigateToPage(currentPage);
                if (!navigated) {
                    console.log(`⚠️ No se pudo navegar a la página ${currentPage}`);
                    break;
                }
            }

            // Extraer datos de la página actual
            const pageOpportunities = await this._extractCurrentPageData();
            this.opportunities.push(...pageOpportunities);

            console.log(`✅ Página ${currentPage}: ${pageOpportunities.length} oportunidades`);

            // Verificar si hay más páginas
            hasMorePages = this._hasNextPage();
            currentPage++;

            // Límite de seguridad para evitar loops infinitos
            if (currentPage > 50) {
                console.warn('⚠️ Límite de páginas alcanzado (50)');
                break;
            }
        }

        console.log(`📊 Total de páginas procesadas: ${currentPage - 1}`);
    }

    // Extraer datos de la página actual
    async _extractCurrentPageData() {
        await this._waitForPageLoad();

        const table = this.findMainTable();
        if (!table) {
            console.warn('⚠️ No se encontró tabla en esta página');
            return [];
        }

        const rows = this._findTableRows(table);
        console.log(`📊 Encontradas ${rows.length} filas en página actual`);

        const pageOpportunities = [];
        rows.forEach((row, index) => {
            try {
                const opportunity = this.extractRowData(row, index);
                if (opportunity) {
                    pageOpportunities.push(opportunity);
                }
            } catch (error) {
                console.warn(`⚠️ Error extrayendo fila ${index}:`, error);
            }
        });

        return pageOpportunities;
    }

    // Encontrar filas de la tabla
    _findTableRows(table) {
        let rows = table.querySelectorAll('.wct-grid-box-row');

        if (rows.length === 0) {
            rows = table.querySelectorAll('.grid-table-row[style*="grid-template-columns"]');
        }

        if (rows.length === 0) {
            rows = document.querySelectorAll('.wct-grid-box-row, .grid-table-row[style*="grid-template-columns"]');
        }

        return Array.from(rows);
    }

    // Esperar a que cargue la página
    async _waitForPageLoad() {
        return new Promise((resolve) => {
            const checkLoading = () => {
                const loadingElement = document.querySelector('.loadingMessage, .loading');
                if (!loadingElement || loadingElement.style.display === 'none') {
                    setTimeout(resolve, 500); // Esperar un poco más para asegurar carga completa
                } else {
                    setTimeout(checkLoading, 200);
                }
            };
            checkLoading();
        });
    }

    // Obtener número de página actual
    _getCurrentPageNumber() {
        const pageIndicator = document.querySelector('.pagination .active, .current-page');
        if (pageIndicator) {
            const pageText = pageIndicator.textContent.trim();
            const pageNumber = parseInt(pageText);
            return isNaN(pageNumber) ? 1 : pageNumber;
        }
        return 1;
    }

    // Navegar a una página específica
    async _navigateToPage(pageNumber) {
        const paginationContainer = document.querySelector('.pagination, .pager');
        if (!paginationContainer) {
            return false;
        }

        // Buscar botón o enlace de la página
        const pageButton = paginationContainer.querySelector(`[data-page="${pageNumber}"], a[href*="page=${pageNumber}"]`);
        if (pageButton) {
            pageButton.click();
            await this._waitForPageLoad();
            return true;
        }

        // Buscar botón "Siguiente" si es la página siguiente
        const nextButton = paginationContainer.querySelector('.next, .page-next, [aria-label*="next"]');
        if (nextButton && pageNumber === this._getCurrentPageNumber() + 1) {
            nextButton.click();
            await this._waitForPageLoad();
            return true;
        }

        return false;
    }

    // Verificar si hay página siguiente
    _hasNextPage() {
        const paginationContainer = document.querySelector('.pagination, .pager');
        if (!paginationContainer) {
            return false;
        }

        const nextButton = paginationContainer.querySelector('.next:not(.disabled), .page-next:not(.disabled)');
        return nextButton !== null;
    }

    // Extraer tipo de inversión
    extractInvestmentType(row, cells) {
        const typeCell = row.querySelector('[data-name="Tipo de inversión"]');
        if (typeCell) {
            const badge = typeCell.querySelector('.badge');
            if (badge) {
                const type = badge.textContent.trim().toLowerCase();
                return type;
            }
        }

        // Fallback: buscar badges en cualquier parte
        const badges = row.querySelectorAll('.badge');
        for (const badge of badges) {
            const text = badge.textContent.trim().toLowerCase();
            if (['factoring', 'confirming', 'pagaré', 'prestamo'].includes(text)) {
                return text;
            }
        }

        return 'factoring'; // Default
    }

    // Extraer moneda
    extractPrestamypeCurrency(row, cells) {
        const amountCell = row.querySelector('[data-name="Monto total"]');
        if (amountCell) {
            const currencySpan = amountCell.querySelector('.currency');
            if (currencySpan) {
                return currencySpan.textContent.trim();
            }
        }

        // Buscar texto que contenga moneda
        for (const cell of cells) {
            const text = cell.textContent;
            if (text.includes('PEN')) return 'PEN';
            if (text.includes('USD')) return 'USD';
            if (text.includes('EUR')) return 'EUR';
        }

        return 'PEN'; // Default para Perú
    }

    // Extraer datos de la página actual de manera síncrona
    _extractCurrentPageDataSync() {
        const table = this.findMainTable();
        if (!table) {
            console.warn('⚠️ No se encontró tabla en esta página');
            return [];
        }

        const rows = this._findTableRows(table);
        console.log(`📊 Encontradas ${rows.length} filas en página actual`);

        const pageOpportunities = [];
        rows.forEach((row, index) => {
            try {
                const opportunity = this.extractRowData(row, index);
                if (opportunity) {
                    pageOpportunities.push(opportunity);
                }
            } catch (error) {
                console.warn(`⚠️ Error extrayendo fila ${index}:`, error);
            }
        });

        return pageOpportunities;
    }

    // Encontrar la tabla principal
    findMainTable() {
        // Primero buscar el grid-table específico de Prestamype
        const gridTable = document.querySelector('.wct-grid-table');
        if (gridTable && this.isValidOpportunityTable(gridTable)) {
            return gridTable;
        }

        // Buscar por el contenedor de la tabla
        const tableContent = document.querySelector('.table-content');
        if (tableContent) {
            const gridTableInContent = tableContent.querySelector('.wct-grid-table');
            if (gridTableInContent && this.isValidOpportunityTable(gridTableInContent)) {
                return gridTableInContent;
            }
        }

        // Posibles selectores para la tabla de oportunidades
        const selectors = [
            '.grid-table-body',
            '.content-table-oportunity .wct-grid-table',
            'table[class*="opportunities"]',
            'table[class*="prestamos"]',
            'table[class*="inversiones"]',
            '.table-responsive table',
            '[data-testid="opportunities-table"]'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                const table = element.tagName === 'TABLE' ? element : element.closest('.wct-grid-table') || element;
                if (table && this.isValidOpportunityTable(table)) {
                    return table;
                }
            }
        }

        // Buscar por contenido típico de Prestamype
        const tables = document.querySelectorAll('table, .wct-grid-table, .grid-table-body');
        for (const table of tables) {
            if (this.isValidOpportunityTable(table)) {
                return table;
            }
        }

        return null;
    }

    // Validar si es una tabla de oportunidades válida
    isValidOpportunityTable(table) {
        if (!table) return false;
        
        const text = table.textContent.toLowerCase();
        
        // Palabras específicas de Prestamype factoring
        const prestamypeKeywords = ['retorno anualizado', 'cliente', 'riesgo', 'monto total', 'pago estimado', 'cierre de subasta'];
        const generalKeywords = ['rentabilidad', 'plazo', 'riesgo', 'importe', 'tae', '%', 'oportunidad'];
        
        // Verificar si es la estructura específica de Prestamype
        const prestamypeFound = prestamypeKeywords.filter(keyword => text.includes(keyword));
        if (prestamypeFound.length >= 3) {
            return true;
        }
        
        // Verificar estructura general
        const generalFound = generalKeywords.filter(keyword => text.includes(keyword));
        
        // También verificar si tiene la estructura de grid de Prestamype
        const hasGridStructure = table.classList.contains('wct-grid-table') || 
                                 table.querySelector('.grid-table-head') ||
                                 table.querySelector('.grid-table-body');
        
        return generalFound.length >= 3 || hasGridStructure;
    }

    // Extraer datos de una fila
    extractRowData(row, index) {
        // Para grid de Prestamype, las "celdas" son divs con clase grid-table-cell
        let cells = row.querySelectorAll('.grid-table-cell');
        
        // Fallback a celdas tradicionales
        if (cells.length === 0) {
            cells = row.querySelectorAll('td, th, div[class*="cell"], div[class*="column"]');
        }

        console.log(`📝 Procesando fila ${index} con ${cells.length} celdas`);

        if (cells.length < 3) {
            console.warn(`⚠️ Fila ${index} tiene muy pocas celdas (${cells.length})`);
            return null;
        }

        // Extraer datos básicos adaptado a la estructura de Prestamype
        const opportunity = {
            id: this.generateId(row, index),
            title: this.extractPrestamypeTitle(row, cells),
            amount: this.extractPrestamypeAmount(row, cells),
            return: this.extractPrestamypeReturn(row, cells),
            term: this.extractPrestamypeTerm(row, cells),
            risk: this.extractPrestamypeRisk(row, cells),
            minInvestment: this.extractMinInvestment(row, cells),
            progress: this.extractProgress(row, cells),
            category: this.extractInvestmentType(row, cells),
            currency: this.extractPrestamypeCurrency(row, cells),
            auctionClose: this.extractAuctionClose(row, cells),
            estimatedPayment: this.extractEstimatedPayment(row, cells),
            // Datos adicionales que intentaremos extraer
            auctionCode: this.extractAuctionCode(row, cells),
            raisedAmount: this.extractRaisedAmount(row, cells),
            remainingAmount: this.extractRemainingAmount(row, cells),
            totalInvestors: this.extractTotalInvestors(row, cells),
            maxInvestment: this.extractMaxInvestment(row, cells),
            monthlyReturn: this.extractMonthlyReturn(row, cells),
            paymentGuaranteed: this.extractPaymentGuarantee(row, cells),
            remainingTime: this.extractRemainingTime(row, cells),
            rawData: Array.from(cells).map(cell => cell.textContent.trim())
        };

        console.log(`📊 Oportunidad extraída:`, opportunity);

        // Validar datos mínimos - más flexible para Prestamype
        if (!opportunity.title && !opportunity.amount && !opportunity.return) {
            console.warn(`⚠️ Datos insuficientes en fila ${index}:`, opportunity);
            return null;
        }

        return opportunity;
    }

    // Extraer título específico de Prestamype
    extractPrestamypeTitle(row, cells) {
        // Buscar específicamente la celda del cliente por data-name
        const clientCell = row.querySelector('[data-name="Cliente"]');
        if (clientCell) {
            // Buscar el título del cliente en la estructura específica
            const titleElement = clientCell.querySelector('.title');
            if (titleElement) {
                return titleElement.textContent.trim();
            }
            
            // Fallback a texto general de la celda
            const text = clientCell.textContent.trim();
            if (text && text.length > 3) {
                // Limpiar texto de espacios extras
                return text.replace(/\s+/g, ' ').trim();
            }
        }

        // Fallback: buscar en celdas por posición (segunda celda típicamente)
        if (cells.length > 1) {
            const secondCell = cells[1];
            const text = secondCell.textContent.trim();
            if (text && text.length > 3 && !this.isNumericValue(text)) {
                return text.replace(/\s+/g, ' ').trim();
            }
        }

        return `Oportunidad #${Date.now()}`;
    }

    // Extraer monto específico de Prestamype
    extractPrestamypeAmount(row, cells) {
        // Buscar específicamente la celda del monto total por data-name
        const amountCell = row.querySelector('[data-name="Monto total"]');
        if (amountCell) {
            // Buscar el elemento .mount que contiene el monto
            const mountElement = amountCell.querySelector('.mount p');
            if (mountElement) {
                const amountText = mountElement.textContent.trim();
                const amount = parseFloat(amountText.replace(/,/g, ''));
                if (!isNaN(amount) && amount > 0) {
                    return amount;
                }
            }
            
            // Fallback: buscar en todo el texto de la celda
            const text = amountCell.textContent.trim();
            const numberMatch = text.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
            if (numberMatch) {
                const amount = parseFloat(numberMatch[1].replace(/,/g, ''));
                if (!isNaN(amount) && amount > 1000) {
                    return amount;
                }
            }
        }

        // Fallback: buscar en todas las celdas
        for (const cell of cells) {
            const text = cell.textContent.trim();
            
            // Buscar números con formato de miles (con comas)
            const amountMatch = text.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
            if (amountMatch) {
                const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                if (!isNaN(amount) && amount > 10000) { // Montos típicos de factoring
                    return amount;
                }
            }
        }
        return null;
    }

    // Extraer retorno específico de Prestamype
    extractPrestamypeReturn(row, cells) {
        // Buscar específicamente la celda del retorno anualizado por data-name
        const returnCell = row.querySelector('[data-name="Retorno anualizado"]');
        if (returnCell) {
            const text = returnCell.textContent.trim();
            const returnMatch = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
            if (returnMatch) {
                const returnValue = parseFloat(returnMatch[1].replace(',', '.'));
                if (!isNaN(returnValue) && returnValue > 0 && returnValue < 50) {
                    return returnValue;
                }
            }
        }

        // Fallback: buscar en todas las celdas
        for (const cell of cells) {
            const text = cell.textContent.trim();
            
            // Buscar "XX.X%" o "XX,X%"
            const returnMatch = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
            if (returnMatch) {
                const returnValue = parseFloat(returnMatch[1].replace(',', '.'));
                // Filtrar valores que parecen ser retornos realistas
                if (returnValue > 1 && returnValue < 50) {
                    return returnValue;
                }
            }
        }
        return null;
    }

    // Extraer término/plazo específico de Prestamype
    extractPrestamypeTerm(row, cells) {
        // Buscar la fecha de pago estimado para calcular el plazo
        const paymentCell = row.querySelector('[data-name="Pago estimado"]');
        if (paymentCell) {
            const titleElement = paymentCell.querySelector('.title');
            if (titleElement) {
                const dateText = titleElement.textContent.trim();
                // Formato: "31 dic. 2025"
                const term = this.calculateTermFromSpanishDate(dateText);
                if (term > 0) {
                    return term;
                }
            }
        }

        // También revisar cierre de subasta como referencia adicional
        const auctionCell = row.querySelector('[data-name="Cierre de subasta"]');
        if (auctionCell) {
            const subtitleElement = auctionCell.querySelector('.subtitle');
            if (subtitleElement) {
                const text = subtitleElement.textContent.toLowerCase().trim();
                // Extraer días restantes: "Faltan 11 horas" o "Faltan 109 días"
                const daysMatch = text.match(/faltan\s+(\d+)\s+días/);
                if (daysMatch) {
                    const days = parseInt(daysMatch[1]);
                    return Math.round(days / 30); // Convertir a meses aproximados
                }
                
                const hoursMatch = text.match(/faltan\s+(\d+)\s+horas/);
                if (hoursMatch) {
                    return 1; // Menos de un mes
                }
            }
        }

        // Fallback: buscar en todas las celdas por fechas
        for (const cell of cells) {
            const text = cell.textContent.toLowerCase().trim();
            
            // Buscar "Faltan X días"
            const daysMatch = text.match(/faltan\s+(\d+)\s+días/);
            if (daysMatch) {
                const days = parseInt(daysMatch[1]);
                if (days > 0 && days < 365) {
                    return Math.round(days / 30);
                }
            }
        }
        
        // Valor por defecto para factoring (típicamente corto plazo)
        return 3;
    }

    // Calcular término desde fecha en español
    calculateTermFromSpanishDate(dateText) {
        try {
            // Mapear meses en español a números
            const monthsES = {
                'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
                'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
            };

            // Extraer componentes: "31 dic. 2025"
            const match = dateText.match(/(\d+)\s+(\w+)\.?\s+(\d{4})/);
            if (match) {
                const day = parseInt(match[1]);
                const monthStr = match[2].toLowerCase().substring(0, 3);
                const year = parseInt(match[3]);
                
                if (monthsES.hasOwnProperty(monthStr)) {
                    const targetDate = new Date(year, monthsES[monthStr], day);
                    const today = new Date();
                    const diffTime = targetDate - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (diffDays > 0 && diffDays < 365) {
                        return Math.round(diffDays / 30);
                    }
                }
            }
        } catch (error) {
            console.warn('Error calculando término desde fecha:', error);
        }
        
        return 0;
    }

    // Extraer riesgo específico de Prestamype
    extractPrestamypeRisk(row, cells) {
        // Buscar específicamente la celda del riesgo por data-name
        const riskCell = row.querySelector('[data-name="Riesgo"]');
        if (riskCell) {
            // Buscar el elemento con clase risk
            const riskElement = riskCell.querySelector('[class*="risk-"]');
            if (riskElement) {
                const classes = riskElement.className;
                // Extraer la clase de riesgo: risk-A, risk-B, etc.
                const riskMatch = classes.match(/risk-([A-E])/);
                if (riskMatch) {
                    return riskMatch[1];
                }
            }
            
            // Fallback: buscar texto dentro de la celda
            const text = riskCell.textContent.trim();
            const riskMatch = text.match(/\b([A-E])\b/);
            if (riskMatch) {
                return riskMatch[1];
            }
        }

        // Fallback: buscar por clases CSS en toda la fila
        const riskElements = row.querySelectorAll('[class*="risk-"]');
        for (const elem of riskElements) {
            const classes = elem.className;
            const riskMatch = classes.match(/risk-([A-E])/);
            if (riskMatch) {
                return riskMatch[1];
            }
        }

        // Fallback adicional: buscar en todas las celdas
        for (const cell of cells) {
            const text = cell.textContent.trim();
            const riskMatch = text.match(/\b([A-E])\b/);
            if (riskMatch && text.toLowerCase().includes('riesgo')) {
                return riskMatch[1];
            }
        }
        
        return 'B'; // Riesgo por defecto para factoring
    }

    // Extraer cierre de subasta
    extractAuctionClose(row, cells) {
        const auctionCell = row.querySelector('[data-name="Cierre de subasta"]');
        if (auctionCell) {
            const titleElement = auctionCell.querySelector('.title');
            if (titleElement) {
                return titleElement.textContent.trim();
            }
        }

        // Fallback
        for (const cell of cells) {
            const text = cell.textContent.trim();
            if (text.toLowerCase().includes('cierre') || text.toLowerCase().includes('subasta')) {
                const spanishDateMatch = text.match(/(\d+\s+\w+\.?\s+\d{4})/);
                if (spanishDateMatch) {
                    return spanishDateMatch[1];
                }
                const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
                if (dateMatch) {
                    return dateMatch[1];
                }
            }
        }
        return null;
    }

    // Extraer pago estimado
    extractEstimatedPayment(row, cells) {
        const paymentCell = row.querySelector('[data-name="Pago estimado"]');
        if (paymentCell) {
            const titleElement = paymentCell.querySelector('.title');
            if (titleElement) {
                return titleElement.textContent.trim();
            }
        }

        // Fallback
        for (const cell of cells) {
            const text = cell.textContent.trim();
            if (text.toLowerCase().includes('pago') || text.toLowerCase().includes('estimado')) {
                const spanishDateMatch = text.match(/(\d+\s+\w+\.?\s+\d{4})/);
                if (spanishDateMatch) {
                    return spanishDateMatch[1];
                }
                const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
                if (dateMatch) {
                    return dateMatch[1];
                }
            }
        }
        return null;
    }

    // Extraer progreso de financiación
    extractProgress(row, cells) {
        const progressValue = this._extractProgressFromAmountCell(row) ||
                             this._extractProgressFromProgressBar(cells) ||
                             this._extractProgressFromText(cells);

        return Math.min(Math.max(progressValue || 0, this.MIN_PROGRESS), this.MAX_PROGRESS);
    }

    _extractProgressFromAmountCell(row) {
        const amountCell = row.querySelector('[data-name="Monto total"]');
        const percentageElement = amountCell?.querySelector('.percentage-number');
        if (!percentageElement) return null;

        const percentText = percentageElement.textContent.trim();
        const percentMatch = percentText.match(/(\d+(?:\.\d+)?)/);
        return percentMatch ? parseFloat(percentMatch[1]) : null;
    }

    _extractProgressFromProgressBar(cells) {
        for (const cell of cells) {
            const progressBar = cell.querySelector('[class*="progress"], .bar, [style*="width"]');
            if (!progressBar) continue;

            const style = progressBar.style.width || progressBar.getAttribute('style') || '';
            const widthMatch = style.match(/(\d+(?:\.\d+)?)%/);
            if (widthMatch) {
                return parseFloat(widthMatch[1]);
            }
        }
        return null;
    }

    _extractProgressFromText(cells) {
        for (const cell of cells) {
            const text = cell.textContent.trim();
            const percentMatch = text.match(/(\d+(?:[.,]\d+)?)%/);
            if (percentMatch && !text.includes('rentabilidad') && !text.includes('tae')) {
                return parseFloat(percentMatch[1].replace(',', '.'));
            }
        }
        return null;
    }


    // Generar ID único para la oportunidad
    generateId(row, index) {
        const link = row.querySelector('a[href]');
        if (link) {
            const match = link.href.match(/\/(\d+)/) || link.href.match(/id=(\d+)/);
            if (match) return match[1];
        }
        return `opp_${index}_${Date.now()}`;
    }

    // Extraer título
    extractTitle(row, cells) {
        // Buscar enlaces o texto en negrita
        const link = row.querySelector('a[href]');
        if (link && link.textContent.trim()) {
            return link.textContent.trim();
        }

        const bold = row.querySelector('strong, b');
        if (bold && bold.textContent.trim()) {
            return bold.textContent.trim();
        }

        // Buscar en las primeras celdas
        for (let i = 0; i < Math.min(3, cells.length); i++) {
            const text = cells[i].textContent.trim();
            if (text && text.length > 5 && !this.isNumericValue(text)) {
                return text;
            }
        }

        return `Oportunidad ${cells.length > 0 ? cells[0].textContent.trim() : 'Sin título'}`;
    }

    // Extraer importe
    extractAmount(row, cells) {
        for (const cell of cells) {
            const text = cell.textContent.trim();
            const amount = this.parseAmount(text);
            if (amount > 1000) { // Filtrar importes mínimos
                return amount;
            }
        }
        return null;
    }

    // Extraer rentabilidad
    extractReturn(row, cells) {
        for (const cell of cells) {
            const text = cell.textContent.trim();
            const returnMatch = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
            if (returnMatch) {
                return parseFloat(returnMatch[1].replace(',', '.'));
            }
        }
        return null;
    }

    // Extraer plazo
    extractTerm(row, cells) {
        for (const cell of cells) {
            const text = cell.textContent.toLowerCase().trim();
            
            // Buscar patrones de tiempo
            const monthMatch = text.match(/(\d+)\s*mes(?:es)?/);
            if (monthMatch) {
                return parseInt(monthMatch[1]);
            }
            
            const yearMatch = text.match(/(\d+)\s*año(?:s)?/);
            if (yearMatch) {
                return parseInt(yearMatch[1]) * 12;
            }
            
            const dayMatch = text.match(/(\d+)\s*día(?:s)?/);
            if (dayMatch) {
                return Math.round(parseInt(dayMatch[1]) / 30);
            }
        }
        return null;
    }

    // Extraer riesgo
    extractRisk(row, cells) {
        for (const cell of cells) {
            const text = cell.textContent.trim();
            const riskMatch = text.match(/\b([A-E])\b/);
            if (riskMatch) {
                return riskMatch[1];
            }
        }
        
        // Buscar por clases CSS o colores
        const riskElements = row.querySelectorAll('[class*="risk"], [class*="rating"]');
        for (const elem of riskElements) {
            const classes = elem.className.toLowerCase();
            if (classes.includes('risk-a') || classes.includes('rating-a')) return 'A';
            if (classes.includes('risk-b') || classes.includes('rating-b')) return 'B';
            if (classes.includes('risk-c') || classes.includes('rating-c')) return 'C';
            if (classes.includes('risk-d') || classes.includes('rating-d')) return 'D';
            if (classes.includes('risk-e') || classes.includes('rating-e')) return 'E';
        }
        
        return 'C'; // Riesgo por defecto
    }

    // Extraer inversión mínima
    extractMinInvestment(row, cells) {
        for (const cell of cells) {
            const text = cell.textContent.toLowerCase().trim();
            if (text.includes('mín') || text.includes('min')) {
                const amount = this.parseAmount(cell.textContent);
                if (amount > 0) return amount;
            }
        }
        return 50; // Mínimo por defecto
    }


    // Extraer categoría
    extractCategory(row, cells) {
        const categories = ['inmobiliario', 'empresa', 'personal', 'hipotecario', 'factoring'];
        
        for (const cell of cells) {
            const text = cell.textContent.toLowerCase();
            for (const category of categories) {
                if (text.includes(category)) {
                    return category;
                }
            }
        }
        return 'general';
    }

    // Parsear cantidades monetarias
    parseAmount(text) {
        if (!text) return 0;
        
        // Limpiar texto y buscar números
        const cleanText = text.replace(/[^\d.,€$]/g, '');
        const numberMatch = cleanText.match(/(\d+(?:[.,]\d+)*)/);
        
        if (!numberMatch) return 0;
        
        let amount = parseFloat(numberMatch[1].replace(/,/g, ''));
        
        // Detectar multiplicadores
        const originalText = text.toLowerCase();
        if (originalText.includes('k') || originalText.includes('mil')) {
            amount *= 1000;
        } else if (originalText.includes('m') || originalText.includes('millón')) {
            amount *= 1000000;
        }
        
        return amount;
    }

    // Verificar si un texto es un valor numérico
    isNumericValue(text) {
        return /^\d+([.,]\d+)*[€$%]?$/.test(text.trim());
    }

    // Abrir modal de detalle y extraer información adicional
    async openModalAndExtract(opportunityId) {
        return new Promise((resolve, reject) => {
            try {
                console.log(`🔍 Abriendo modal para oportunidad: ${opportunityId}`);
                
                // Buscar el enlace de la oportunidad por diferentes métodos
                let link = document.querySelector(`a[href*="${opportunityId}"]`);
                
                if (!link) {
                    // Buscar por texto o posición en la tabla
                    const rows = document.querySelectorAll('tbody tr');
                    for (let i = 0; i < rows.length; i++) {
                        const row = rows[i];
                        if (row.textContent.includes(opportunityId) || i.toString() === opportunityId.replace('opp_', '').split('_')[0]) {
                            link = row.querySelector('a[href]');
                            break;
                        }
                    }
                }
                
                if (!link) {
                    console.warn(`⚠️ No se encontró enlace para ${opportunityId}, intentando método alternativo`);
                    // Intentar encontrar botones de "Ver más", "Detalles", etc.
                    const buttons = document.querySelectorAll('button, .btn, [role="button"]');
                    for (const button of buttons) {
                        const text = button.textContent.toLowerCase();
                        if (text.includes('ver') || text.includes('detail') || text.includes('más')) {
                            link = button;
                            break;
                        }
                    }
                }

                if (!link) {
                    resolve({
                        description: 'No se pudo acceder a detalles adicionales',
                        investorInfo: {},
                        financialDetails: {},
                        documents: []
                    });
                    return;
                }

                // No necesitamos guardar todo el contenido del body, es inseguro e ineficiente
                
                // Configurar observer para detectar cambios en el DOM
                const observer = new MutationObserver(() => {
                    const modal = this.findModal();
                    if (modal) {
                        observer.disconnect();
                        setTimeout(() => {
                            try {
                                const modalData = this.extractModalData(modal);
                                resolve(modalData);
                            } catch (error) {
                                console.error('Error extrayendo datos del modal:', error);
                                resolve({
                                    description: 'Error extrayendo datos del modal',
                                    investorInfo: {},
                                    financialDetails: {},
                                    documents: []
                                });
                            }
                        }, 1000);
                    }
                });

                observer.observe(document.body, { 
                    childList: true, 
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class', 'style']
                });

                // Simular click en el enlace/botón
                console.log('🖱️ Haciendo click en:', link);
                link.click();

                // Timeout de seguridad
                setTimeout(() => {
                    observer.disconnect();
                    if (!link.clicked) {
                        console.warn('⏰ Timeout esperando modal');
                        resolve({
                            description: 'Timeout esperando modal',
                            investorInfo: {},
                            financialDetails: {},
                            documents: []
                        });
                    }
                }, 8000);

            } catch (error) {
                console.error('❌ Error abriendo modal:', error);
                reject(error);
            }
        });
    }

    // Encontrar modal en el DOM
    findModal() {
        const selectors = [
            '.modal:not(.hidden)',
            '[role="dialog"]',
            '.popup:not(.hidden)',
            '.overlay:not(.hidden)',
            '.lightbox',
            '[data-modal="true"]',
            '.modal-content',
            '.dialog'
        ];

        for (const selector of selectors) {
            const modal = document.querySelector(selector);
            if (modal && this.isVisibleModal(modal)) {
                return modal;
            }
        }

        // Buscar elementos que aparecieron recientemente
        const recentElements = document.querySelectorAll('[class*="modal"], [class*="popup"], [class*="dialog"]');
        for (const element of recentElements) {
            if (this.isVisibleModal(element)) {
                return element;
            }
        }

        return null;
    }

    // Verificar si un modal está visible
    isVisibleModal(element) {
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               element.offsetHeight > 100; // Asegurar que tiene contenido sustancial
    }

    // Extraer datos del modal
    extractModalData(modal) {
        if (!modal) {
            modal = this.findModal();
        }
        
        if (!modal) {
            throw new Error('Modal no encontrado');
        }

        console.log('📊 Extrayendo datos del modal...');

        const data = {
            description: this.extractModalDescription(modal),
            investorInfo: this.extractInvestorInfo(modal),
            financialDetails: this.extractFinancialDetails(modal),
            documents: this.extractDocuments(modal),
            additionalData: this.extractAdditionalModalData(modal)
        };

        console.log('✅ Datos del modal extraídos:', data);
        return data;
    }

    // Extraer datos adicionales del modal
    extractAdditionalModalData(modal) {
        const additionalData = {};
        
        try {
            // Buscar datos de garantías
            const guaranteeElements = modal.querySelectorAll('[class*="guarantee"], [class*="garantia"]');
            if (guaranteeElements.length > 0) {
                additionalData.guarantees = Array.from(guaranteeElements).map(el => el.textContent.trim());
            }

            // Buscar finalidad del préstamo
            const purposeLabels = Array.from(modal.querySelectorAll('label, .label, strong')).filter(el => 
                el.textContent.toLowerCase().includes('finalidad') || 
                el.textContent.toLowerCase().includes('destino')
            );
            if (purposeLabels.length > 0) {
                const purposeValue = purposeLabels[0].nextElementSibling?.textContent || 
                                   purposeLabels[0].parentElement?.textContent.replace(purposeLabels[0].textContent, '');
                if (purposeValue) {
                    additionalData.purpose = purposeValue.trim();
                }
            }

            // Buscar información de scoring
            const scoringElements = modal.querySelectorAll('[class*="score"], [class*="rating"]');
            if (scoringElements.length > 0) {
                additionalData.scoring = Array.from(scoringElements).map(el => ({
                    type: el.className,
                    value: el.textContent.trim()
                }));
            }

            // Buscar fechas importantes
            const dates = this.extractDatesFromModal(modal);
            if (Object.keys(dates).length > 0) {
                additionalData.dates = dates;
            }

        } catch (error) {
            console.warn('⚠️ Error extrayendo datos adicionales del modal:', error);
        }

        return additionalData;
    }

    // Extraer fechas del modal
    extractDatesFromModal(modal) {
        const dates = {};
        const text = modal.textContent;
        
        // Buscar patrones de fechas
        const datePatterns = [
            { key: 'startDate', pattern: /inicio[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i },
            { key: 'endDate', pattern: /vencimiento[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i },
            { key: 'publishDate', pattern: /publicado[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i }
        ];

        datePatterns.forEach(({ key, pattern }) => {
            const match = text.match(pattern);
            if (match) {
                dates[key] = match[1];
            }
        });

        return dates;
    }

    // Extraer descripción del modal
    extractModalDescription(modal) {
        const descSelectors = ['.description', '.detail', '[class*="desc"]', 'p'];
        for (const selector of descSelectors) {
            const element = modal.querySelector(selector);
            if (element && element.textContent.length > 50) {
                return element.textContent.trim();
            }
        }
        return '';
    }

    // Extraer información del inversor
    extractInvestorInfo(modal) {
        const info = {};
        const labels = modal.querySelectorAll('label, .label, strong');
        
        labels.forEach(label => {
            const text = label.textContent.toLowerCase();
            const value = label.nextElementSibling?.textContent || 
                         label.parentElement?.textContent.replace(label.textContent, '');
            
            if (text.includes('inversor') || text.includes('solicitante')) {
                info.name = value?.trim();
            } else if (text.includes('edad')) {
                info.age = parseInt(value) || null;
            } else if (text.includes('ingresos')) {
                info.income = this.parseAmount(value) || null;
            }
        });
        
        return info;
    }

    // Extraer detalles financieros
    extractFinancialDetails(modal) {
        const details = {};
        const text = modal.textContent;
        
        // Buscar TIN, TAE, etc.
        const tinMatch = text.match(/TIN[:\s]*(\d+(?:[.,]\d+)?)%/i);
        if (tinMatch) details.tin = parseFloat(tinMatch[1].replace(',', '.'));
        
        const taeMatch = text.match(/TAE[:\s]*(\d+(?:[.,]\d+)?)%/i);
        if (taeMatch) details.tae = parseFloat(taeMatch[1].replace(',', '.'));
        
        return details;
    }

    // Extraer documentos disponibles
    extractDocuments(modal) {
        const links = modal.querySelectorAll('a[href*="pdf"], a[href*="doc"]');
        return Array.from(links).map(link => ({
            name: link.textContent.trim(),
            url: link.href
        }));
    }
}

// Instancia global del extractor
const extractor = new PrestamypeExtractor();

// Listener para mensajes del popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Mensaje recibido:', request);
    
    if (request.action === 'extractData') {
        // Usar timeout para evitar bloqueos
        const extractionTimeout = setTimeout(() => {
            sendResponse({ 
                success: false, 
                error: 'Timeout en extracción de datos',
                url: window.location.href
            });
        }, 15000); // 15 segundos timeout

        try {
            // Verificar que estamos en la página correcta
            if (!window.location.href.includes('prestamype.com')) {
                clearTimeout(extractionTimeout);
                sendResponse({ 
                    success: false, 
                    error: 'No estás en Prestamype.com',
                    url: window.location.href
                });
                return;
            }

            // Esperar a que la página esté completamente cargada
            const waitForPage = () => {
                const hasGridTable = document.querySelector('.wct-grid-table') !== null;
                const hasTableContent = document.querySelector('.table-content') !== null;
                const isLoading = document.querySelector('.loadingMessage')?.style.display !== 'none';

                if ((document.readyState === 'complete' || hasGridTable || hasTableContent) && !isLoading) {
                    try {
                        console.log('🔄 Intentando extraer datos...');
                        const opportunities = extractor.extractTableData();
                        clearTimeout(extractionTimeout);
                        sendResponse({
                            success: true,
                            data: opportunities,
                            url: window.location.href,
                            timestamp: Date.now(),
                            pageTitle: document.title,
                            debug: {
                                gridTablesFound: document.querySelectorAll('.wct-grid-table').length,
                                tablesFound: document.querySelectorAll('table').length,
                                hasTableContent: hasTableContent,
                                isLoading: isLoading
                            }
                        });
                    } catch (error) {
                        clearTimeout(extractionTimeout);
                        console.error('❌ Error en extracción:', error);
                        sendResponse({ 
                            success: false, 
                            error: error.message,
                            url: window.location.href,
                            debug: {
                                gridTablesFound: document.querySelectorAll('.wct-grid-table').length,
                                tablesFound: document.querySelectorAll('table').length,
                                hasTableContent: hasTableContent,
                                isLoading: isLoading,
                                bodyText: document.body.textContent.slice(0, 300),
                                gridTableHTML: document.querySelector('.wct-grid-table')?.innerHTML?.slice(0, 500) || 'No encontrado'
                            }
                        });
                    }
                } else {
                    // Esperar un poco más
                    console.log('⏳ Esperando que la página termine de cargar...', {
                        readyState: document.readyState,
                        hasGridTable,
                        hasTableContent,
                        isLoading
                    });
                    setTimeout(waitForPage, 1000); // Esperar más tiempo para cargas dinámicas
                }
            };

            waitForPage();
            
        } catch (error) {
            clearTimeout(extractionTimeout);
            console.error('❌ Error general:', error);
            sendResponse({ 
                success: false, 
                error: error.message,
                url: window.location.href
            });
        }

        return true; // Indica respuesta asíncrona
        
    } else if (request.action === 'extractModal') {
        extractor.openModalAndExtract(request.opportunityId)
            .then(modalData => {
                sendResponse({ success: true, data: modalData });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        return true; // Indica respuesta asíncrona
    }
    
    // Ping para verificar que el content script está vivo
    else if (request.action === 'ping') {
        sendResponse({ 
            success: true, 
            message: 'Content script activo',
            url: window.location.href,
            timestamp: Date.now()
        });
    }
});

// Métodos adicionales para extraer información detallada de los paneles
PrestamypeExtractor.prototype.extractAuctionCode = function(row, cells) {
    // Buscar código de subasta en celdas o usar ID de la fila
    const codeMatch = row.textContent.match(/[A-Z0-9]{8}/);
    return codeMatch ? codeMatch[0] : null;
};

PrestamypeExtractor.prototype.extractRaisedAmount = function(row, cells) {
    // Intentar calcular el monto recaudado basado en el progreso
    const amount = this.extractPrestamypeAmount(row, cells);
    const progress = this.extractProgress(row, cells);
    if (amount && progress) {
        return amount * (progress / 100);
    }
    return null;
};

PrestamypeExtractor.prototype.extractRemainingAmount = function(row, cells) {
    // Calcular monto restante
    const amount = this.extractPrestamypeAmount(row, cells);
    const progress = this.extractProgress(row, cells);
    if (amount && progress) {
        return amount * ((100 - progress) / 100);
    }
    return null;
};

PrestamypeExtractor.prototype.extractTotalInvestors = function(row, cells) {
    // Por ahora retornar null, se podría extraer del panel modal
    return null;
};

PrestamypeExtractor.prototype.extractMaxInvestment = function(row, cells) {
    // Por ahora retornar null, se podría extraer del panel modal
    return null;
};

PrestamypeExtractor.prototype.extractMonthlyReturn = function(row, cells) {
    // Extraer el retorno mensual basado en el anual
    const annualReturn = this.extractPrestamypeReturn(row, cells);
    if (annualReturn) {
        return annualReturn / 12; // Aproximación simple
    }
    return null;
};

PrestamypeExtractor.prototype.extractPaymentGuarantee = function(row, cells) {
    // Buscar indicadores de garantía en el texto
    const text = row.textContent.toLowerCase();
    return text.includes('garantia') || text.includes('asegurado') || text.includes('respaldo');
};

PrestamypeExtractor.prototype.extractRemainingTime = function(row, cells) {
    // Buscar patrones de tiempo restante
    const text = row.textContent;
    const timeMatch = text.match(/faltan?\s*(\d+)\s*(hora|día|minuto)/i);
    return timeMatch ? timeMatch[0] : null;
};

// Inicialización cuando se carga la página
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🚀 Prestamype Analyzer content script cargado');
    });
} else {
    console.log('🚀 Prestamype Analyzer content script cargado');
}