
const GraphModule = (() => {
    let calculator = null;
    let points = [];
    let pointMode = false;
    let expressionCounter = 0;
    let clickListener = null;


    function snapToDecimal(val) {
        return Math.round(val * 10) / 10;
    }


    function initGraph() {
        const container = document.getElementById('desmosGraph');
        if (!container) return;

        if (calculator) {

            calculator.resize();
            return;
        }

        calculator = Desmos.GraphingCalculator(container, {
            expressions: true,
            settingsMenu: false,
            zoomButtons: true,
            expressionsTopbar: false,
            border: false,
            keypad: false,
            expressionsCollapsed: true,
            lockViewport: false,
            images: false,
            folders: false,
            notes: false,
            sliders: true,
            links: false,
            trace: true,
        });


        calculator.setMathBounds({
            left: -10,
            right: 10,
            bottom: -7,
            top: 7
        });
    }


    function enablePointMode() {
        pointMode = true;
        if (!calculator) return;

        const graphContainer = document.getElementById('desmosGraph');


        if (clickListener) {
            graphContainer.removeEventListener('click', clickListener);
        }

        clickListener = function (evt) {
            if (!pointMode) return;

            const rect = graphContainer.getBoundingClientRect();
            const pixelX = evt.clientX - rect.left;
            const pixelY = evt.clientY - rect.top;


            const mathCoords = calculator.pixelsToMath({ x: pixelX, y: pixelY });


            const x = snapToDecimal(mathCoords.x);
            const y = snapToDecimal(mathCoords.y);

            addPoint(x, y);
        };

        graphContainer.addEventListener('click', clickListener);
    }


    function disablePointMode() {
        pointMode = false;
        const graphContainer = document.getElementById('desmosGraph');
        if (clickListener && graphContainer) {
            graphContainer.removeEventListener('click', clickListener);
            clickListener = null;
        }
    }


    function addPoint(x, y) {
        points.push({ x, y });
        updatePointsOnGraph();
        updatePointsList();
    }


    function removePoint(index) {
        points.splice(index, 1);
        updatePointsOnGraph();
        updatePointsList();
    }


    function updatePointsOnGraph() {
        if (!calculator) return;


        calculator.removeExpression({ id: 'points-table' });

        if (points.length === 0) return;


        const xValues = points.map(p => p.x);
        const yValues = points.map(p => p.y);

        calculator.setExpression({
            id: 'points-table',
            type: 'table',
            columns: [
                {
                    latex: 'x_1',
                    values: xValues.map(String),
                    dragMode: Desmos.DragModes.NONE
                },
                {
                    latex: 'y_1',
                    values: yValues.map(String),
                    color: '#e74c3c',
                    pointStyle: Desmos.Styles.POINT,
                    pointSize: 12,
                    dragMode: Desmos.DragModes.NONE
                }
            ]
        });
    }


    function updatePointsList() {
        const listEl = document.getElementById('pointsList');
        if (!listEl) return;

        if (points.length === 0) {
            listEl.innerHTML = '<p class="empty-state" style="font-size:13px;opacity:0.6;">No points added yet</p>';
            return;
        }

        listEl.innerHTML = points.map((p, i) =>
            `<span class="point-chip">
                (${p.x}, ${p.y})
                <button class="point-remove" data-idx="${i}">✕</button>
            </span>`
        ).join('');


        listEl.querySelectorAll('.point-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute('data-idx'));
                removePoint(idx);
            });
        });
    }


    function clearPoints() {
        points = [];
        if (calculator) {
            calculator.removeExpression({ id: 'points-table' });
            calculator.removeExpression({ id: 'fit-curve' });
        }
        updatePointsList();
    }


    function plotLatexEquation(latex) {
        if (!calculator) initGraph();

        try {
            // Sanitize: MathLive may use \cdot for multiplication, Desmos needs direct form
            let desmosLatex = latex
                .replace(/\\cdot/g, '\\cdot ')  // keep cdot, Desmos understands it
                .replace(/\\left\(/g, '(')
                .replace(/\\right\)/g, ')')
                .replace(/\\left\[/g, '[')
                .replace(/\\right\]/g, ']');

            expressionCounter++;
            calculator.setExpression({
                id: `expr-${expressionCounter}`,
                latex: desmosLatex,
                color: getColor(expressionCounter)
            });

            return true;
        } catch (e) {
            console.error('Desmos plot error:', e);
            return false;
        }
    }


    function plotEquation(text) {
        if (!calculator) initGraph();

        try {

            let latex = text.trim()
                .replace(/\*\*/g, '^')
                .replace(/\*/g, '\\cdot ');

            expressionCounter++;
            calculator.setExpression({
                id: `expr-${expressionCounter}`,
                latex: latex,
                color: getColor(expressionCounter)
            });

            return true;
        } catch (e) {
            console.error('Desmos plot error:', e);
            return false;
        }
    }


    function fitCurve(degree) {
        if (points.length < degree + 1) {
            return null;
        }

        const coefficients = polynomialFit(points, degree);
        if (!coefficients) return null;


        let latex = 'y=';
        const terms = [];

        for (let i = coefficients.length - 1; i >= 0; i--) {
            const coeff = Math.round(coefficients[i] * 1000) / 1000;
            if (Math.abs(coeff) < 0.0005) continue;

            let term = '';
            if (i === 0) {
                term = `${coeff}`;
            } else if (i === 1) {
                term = coeff === 1 ? 'x' : coeff === -1 ? '-x' : `${coeff}x`;
            } else {
                term = coeff === 1 ? `x^{${i}}` : coeff === -1 ? `-x^{${i}}` : `${coeff}x^{${i}}`;
            }
            terms.push(term);
        }

        latex += terms.length > 0 ? terms.join('+').replace(/\+\s*-/g, '-') : '0';


        calculator.removeExpression({ id: 'fit-curve' });
        calculator.setExpression({
            id: 'fit-curve',
            latex: latex,
            color: '#2ecc71'
        });

        return latex.replace('y=', '');
    }

    // Polynomial regression (Gaussian elimination)
    function polynomialFit(pts, degree) {
        const n = pts.length;
        const size = degree + 1;


        const matrix = [];
        for (let i = 0; i < size; i++) {
            matrix[i] = [];
            for (let j = 0; j < size; j++) {
                let sum = 0;
                for (let k = 0; k < n; k++) {
                    sum += Math.pow(pts[k].x, i + j);
                }
                matrix[i][j] = sum;
            }

            let sum = 0;
            for (let k = 0; k < n; k++) {
                sum += pts[k].y * Math.pow(pts[k].x, i);
            }
            matrix[i][size] = sum;
        }

        // Gaussian elimination
        for (let i = 0; i < size; i++) {
            let maxRow = i;
            for (let k = i + 1; k < size; k++) {
                if (Math.abs(matrix[k][i]) > Math.abs(matrix[maxRow][i])) maxRow = k;
            }
            [matrix[i], matrix[maxRow]] = [matrix[maxRow], matrix[i]];

            if (Math.abs(matrix[i][i]) < 1e-10) return null;

            for (let k = i + 1; k < size; k++) {
                const factor = matrix[k][i] / matrix[i][i];
                for (let j = i; j <= size; j++) {
                    matrix[k][j] -= factor * matrix[i][j];
                }
            }
        }


        const coefficients = new Array(size);
        for (let i = size - 1; i >= 0; i--) {
            coefficients[i] = matrix[i][size];
            for (let j = i + 1; j < size; j++) {
                coefficients[i] -= matrix[i][j] * coefficients[j];
            }
            coefficients[i] /= matrix[i][i];
        }

        return coefficients;
    }


    function getExpressions() {
        if (!calculator) return [];
        const state = calculator.getState();
        return (state.expressions?.list || [])
            .filter(e => e.type === 'expression' && e.latex)
            .map(e => e.latex);
    }


    function getPoints() {
        return [...points];
    }


    function getColor(index) {
        const colors = [
            '#c74440', '#2d70b3', '#388c46', '#6042a6',
            '#000000', '#fa7e19', '#e05fa4', '#0e8483'
        ];
        return colors[(index - 1) % colors.length];
    }


    function getCalculator() {
        return calculator;
    }

    return {
        initGraph,
        enablePointMode,
        disablePointMode,
        addPoint,
        clearPoints,
        plotLatexEquation,
        plotEquation,
        fitCurve,
        getPoints,
        getExpressions,
        getCalculator,
        updatePointsList
    };
})();
