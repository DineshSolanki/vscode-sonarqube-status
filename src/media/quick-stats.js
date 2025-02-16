(() => {
  const vscode = acquireVsCodeApi();
  const previousState = vscode.getState();
  const measuresContainer = document.getElementById('measures-container');
  const qualityGateContainer = document.getElementById('quality-gate-container');

  if (previousState?.payload) {
    updateUI(previousState.payload);
  }

  window.addEventListener('message', (event) => {
    const { payload, type } = event.data;
    console.log('Received message:', type, payload); // Debug log
    switch (type) {
      case 'updateMeasures':
        vscode.setState({ payload });
        updateUI(payload);
        break;
    }
  });

  function showLoadingState() {
    console.log('Showing loading state');
    measuresContainer.innerHTML = `
      <div class="loading-container">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
          <path fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8V2z"/>
        </svg>
        <p>Loading metrics...</p>
      </div>
    `;
  }

  function hideLoadingState() {
    const loadingContainer = document.querySelector('.loading-container');
    if (loadingContainer) {
      loadingContainer.remove();
    }
  }

  function updateUI(payload) {
    console.log('Updating UI with payload:', payload);
    
    if (!payload?.measures) {
      console.log('No measures found in payload');
      return;
    }

    // Show loading state while processing
    showLoadingState();

    try {
      const measuresArray = Array.isArray(payload.measures) 
        ? payload.measures 
        : [payload.measures];

      console.log('Processing measures:', measuresArray);

      if (!measuresArray.length) {
        console.log('Empty measures array');
        return;
      }

      const measures = measuresArray.map(measure => ({
        label: formatMetricName(measure.metric),
        value: formatMetricValue(measure.metric, measure.value),
        domain: getMetricDomain(measure.metric),
        bestValue: measure.bestValue,
        metric: measure.metric
      }));

      console.log('Transformed measures:', measures);

      // Hide loading state before updating UI
      hideLoadingState();

      const organizedMeasures = organizeMeasuresByDomain(measures);
      const fragment = document.createDocumentFragment();
      fragment.appendChild(createCards(organizedMeasures));
      measuresContainer.innerHTML = '';
      measuresContainer.appendChild(fragment);
      
      const alertStatus = measures.find(m => m.metric === 'alert_status')?.value;
      qualityGateContainer.innerHTML = getStatus(alertStatus);
      
      addCardEventListeners();
      animateCards();
      updateProjectInfo(payload);

    } catch (error) {
      console.error('Error updating UI:', error);
      showLoadingState();
    }
  }

  function formatMeasures(rawMeasures) {
    return rawMeasures.map(measure => ({
      label: formatMetricName(measure.metric),
      value: formatMetricValue(measure.metric, measure.value),
      domain: getMetricDomain(measure.metric),
      bestValue: measure.bestValue,
      metric: measure.metric
    }));
  }

  function formatMetricName(metric) {
    const names = {
      'security_hotspots': 'Security Hotspots',
      'vulnerabilities': 'Vulnerabilities',
      'critical_violations': 'Critical Issues',
      'duplicated_blocks': 'Duplicated Blocks',
      'ncloc': 'Lines of Code',
      'coverage': 'Coverage',
      'code_smells': 'Code Smells',
      'alert_status': 'Quality Gate',
      'sqale_rating': 'Maintainability',
      'sqale_index': 'Technical Debt',
      'bugs': 'Bugs',
      'security_review_rating': 'Security Review',
      'duplicated_lines_density': 'Duplication',
      'cognitive_complexity': 'Cognitive Complexity'
    };
    return names[metric] || metric;
  }

  function formatMetricValue(metric, value) {
    if (value === undefined || value === null) return 'N/A';

    switch (metric) {
      case 'coverage':
      case 'duplicated_lines_density':
        const numValue = parseFloat(value);
        const indicator = getMetricIndicator(metric, numValue);
        return `${value}% ${indicator}`;
      case 'sqale_rating':
      case 'security_review_rating':
        return RATING_VALUE_MAP[parseFloat(value)] || value;
      case 'sqale_index':
        return formatDuration(parseInt(value));
      case 'cognitive_complexity':
        const complexity = parseInt(value);
        const complexityIndicator = getComplexityIndicator(complexity);
        return `${value} ${complexityIndicator}`;
      default:
        return value;
    }
  }

  const RATING_VALUE_MAP = {
    1: 'A',
    2: 'B',
    3: 'C',
    4: 'D',
    5: 'E'
  };

  function formatDuration(minutes) {
    if (minutes < 60) return minutes + ' min';
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours < 24) return `${hours}h ${remainingMinutes}m`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }

  function getMetricDomain(metric) {
    const domains = {
      'bugs': 'Reliability',
      'reliability_rating': 'Reliability',
      'vulnerabilities': 'Security',
      'security_rating': 'Security',
      'security_hotspots': 'Security',
      'security_review_rating': 'Security',
      'code_smells': 'Maintainability',
      'sqale_rating': 'Maintainability',
      'sqale_index': 'Maintainability',
      'cognitive_complexity': 'Maintainability',
      'coverage': 'Coverage',
      'duplicated_lines_density': 'Duplications',
      'duplicated_blocks': 'Duplications',
      'ncloc': 'Size'
    };
    return domains[metric] || 'Other';
  }

  function getAlertStatus(measures) {
    const statusMeasure = measures.find(m => m.metric === 'alert_status');
    return statusMeasure ? statusMeasure.value : null;
  }

  function organizeMeasuresByDomain(measures) {
    // First, organize by predefined domains
    const domains = {
      'Needs Attention': [], // For metrics that need immediate attention
      'Security': [],       // Group all security-related metrics
      'Code Quality': [],   // Group maintainability and reliability metrics
      'Code Stats': []      // Group size and other stats
    };

    measures.forEach(measure => {
      // Check for metrics needing attention first
      if (needsAttention(measure)) {
        domains['Needs Attention'].push(measure);
        return;
      }

      // Then categorize the rest
      if (isSecurityMetric(measure.metric)) {
        domains['Security'].push(measure);
      } else if (isQualityMetric(measure.metric)) {
        domains['Code Quality'].push(measure);
      } else {
        domains['Code Stats'].push(measure);
      }
    });

    // Remove empty domains and sort items within each domain
    return Object.entries(domains)
      .filter(([_, items]) => items.length > 0)
      .map(([domain, items]) => ({
        domain,
        items: sortMetricsByPriority(items, domain)
      }));
  }

  function isSecurityMetric(metric) {
    return metric.includes('security') || 
           metric === 'vulnerabilities' || 
           metric === 'security_hotspots';
  }

  function isQualityMetric(metric) {
    return metric.includes('smell') || 
           metric.includes('bug') || 
           metric === 'sqale_rating' || 
           metric === 'sqale_index' ||
           metric === 'coverage';
  }

  function needsAttention(measure) {
    const value = parseFloat(measure.value);
    switch (measure.metric) {
      case 'coverage':
        return value < 40;
      case 'code_smells':
        return parseInt(measure.value) > 0;
      case 'duplicated_lines_density':
        return value > 3;
      case 'cognitive_complexity':
        return value > 50;
      case 'alert_status':
        return measure.value === 'ERROR';
      default:
        return false;
    }
  }

  function sortMetricsByPriority(items, domain) {
    const priorityOrder = {
      'Needs Attention': ['coverage', 'code_smells', 'duplicated_lines_density', 'cognitive_complexity'],
      'Security': ['vulnerabilities', 'security_hotspots', 'security_review_rating'],
      'Code Quality': ['bugs', 'sqale_rating', 'sqale_index'],
      'Code Stats': ['ncloc', 'duplicated_blocks']
    };

    const order = priorityOrder[domain] || [];
    return items.sort((a, b) => {
      const aIndex = order.indexOf(a.metric);
      const bIndex = order.indexOf(b.metric);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  function createCards(domainGroups) {
    const fragment = document.createDocumentFragment();
    domainGroups.forEach((group, index) => {
      const domainGroup = document.createElement('div');
      domainGroup.className = 'domain-group';
      domainGroup.dataset.domain = group.domain;
      domainGroup.style.animationDelay = `${index * 100}ms`;

      const domainTitle = document.createElement('h3');
      domainTitle.className = 'domain-title';
      domainTitle.textContent = group.domain;
      domainGroup.appendChild(domainTitle);

      const list = document.createElement('ul');
      list.className = 'quick-stats__list';
      group.items.forEach((item, i) => {
        list.appendChild(createCard(item, group.domain, i));
      });
      domainGroup.appendChild(list);

      fragment.appendChild(domainGroup);
    });
    return fragment;
  }

  function createCard(card, domain, index) {
    const listItem = document.createElement('li');
    listItem.className = `quick-stats__list-item domain-${domain} ${getStatusClass(card)}`;
    listItem.dataset.metric = card.label;
    listItem.dataset.description = getMetricDescription(card.label);
    listItem.style.animationDelay = `${index * 50}ms`;

    const header = document.createElement('header');
    const value = document.createElement('p');
    value.className = `item__value ${getValueClass(card)}`;
    value.innerHTML = `${card.value} ${getTrendIcon(card)}`;
    header.appendChild(value);
    listItem.appendChild(header);

    const footer = document.createElement('footer');
    const label = document.createElement('p');
    label.className = 'item__label';
    label.textContent = card.label;
    footer.appendChild(label);
    footer.innerHTML += getStatusBadge(card);
    listItem.appendChild(footer);

    return listItem;
  }

  function getTrendIcon(card) {
    if (card.bestValue) {
      return '<span class="trend positive">✓</span>';
    }
    
    if (typeof card.value === 'string') {
      if (['A', 'OK'].includes(card.value)) return '<span class="trend positive">↑</span>';
      if (['D', 'E', 'ERROR'].includes(card.value)) return '<span class="trend negative">↓</span>';
    }
    
    if (card.metric.includes('coverage')) {
      const value = parseFloat(card.value);
      if (value >= 80) return '<span class="trend positive">↑</span>';
      if (value <= 50) return '<span class="trend negative">↓</span>';
    }
    
    return '';
  }

  function getValueClass(card) {
    if (card.bestValue) return 'value-best';
    if (card.metric.includes('rating')) {
      const rating = card.value;
      if (rating === 'A') return 'value-best';
      if (rating === 'B') return 'value-good';
      if (rating === 'C') return 'value-fair';
      if (rating === 'D' || rating === 'E') return 'value-poor';
    }
    return '';
  }

  function getMetricDescription(metric) {
    const descriptions = {
      'Bugs': 'Number of bug issues in the code',
      'Vulnerabilities': 'Number of security vulnerabilities',
      'Code Smells': 'Number of maintainability issues',
      'Coverage': 'Percentage of code covered by tests',
      'Duplicated Lines': 'Percentage of duplicated lines',
      'Technical Debt': 'Time required to fix all code smells',
      'sqale_rating': 'Maintainability Rating (A-E) - Effort to fix maintainability issues',
      'Maintainability Rating': 'Rating from A (best) to E (worst) based on the technical debt ratio',
      'NCLOC': 'Number of non-comment lines of code',
      'Lines of Code': 'Total number of non-comment lines of code',
      'Security Rating': 'Rating from A (no vulnerabilities) to E (high-severity vulnerabilities)',
      'Reliability Rating': 'Rating from A (no bugs) to E (critical bugs)',
      'Security Hotspots': 'Security-sensitive code that requires manual review',
      'Duplicated Blocks': 'Number of duplicated blocks of code',
      'Critical Issues': 'Number of critical-severity issues',
      'Technical Debt Ratio': 'Ratio between the current technical debt and the estimated time to develop the application',
      'Quality Gate Status': 'Overall status indicating if your code meets your quality standards'
    };
    
    // For ratings, add the rating scale explanation
    if (metric.toLowerCase().includes('rating')) {
      const baseDesc = descriptions[metric] || '';
      return `${baseDesc}\nA = Best, B = Good, C = Fair, D = Poor, E = Worst`;
    }
    
    return descriptions[metric] || metric;
  }

  function getStatusClass(card) {
    if (card.metric === 'coverage') {
      const value = parseFloat(card.value);
      if (value < 40) return 'status-critical';
      if (value < 60) return 'status-warning';
      if (value >= 80) return 'status-good';
    }
    if (card.metric === 'duplicated_lines_density') {
      const value = parseFloat(card.value);
      if (value > 10) return 'status-warning';
      if (value <= 3) return 'status-good';
    }
    return '';
  }

  function getStatusBadge(card) {
    if (card.bestValue) {
      return '<span class="best-value-badge">Best Value</span>';
    }
    
    if (card.metric === 'coverage') {
      const value = parseFloat(card.value);
      if (value < 40) {
        return '<span class="status-badge critical">Needs Attention</span>';
      }
      if (value < 60) {
        return '<span class="status-badge warning">Could Improve</span>';
      }
    }
    
    return '';
  }

  function getStatus(status) {
    const description = getQualityGateDescription(status);
    switch (status) {
      case 'ERROR':
        return `
          <div class="quality-gate__badge quality-gate__fail" title="${description}">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
              <path fill="none" d="M0 0h24v24H0z"/>
              <path fill="currentColor" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10-10-4.477 10-10 10zm0-11.414L9.172 7.757 7.757 9.172 10.586 12l-2.829 2.828 1.415 1.415L12 13.414l2.828 2.829 1.415-1.415L13.414 12l2.829-2.828-1.415-1.415L12 10.586z"/>
            </svg>
            <div>
              <p>Quality Gate Failed</p>
              <small class="quality-gate__details">Click for details</small>
            </div>
          </div>`;
      case 'OK':
        return `
          <div class="quality-gate__badge quality-gate__pass" title="${description}">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
              <path fill="none" d="M0 0h24v24H0z"/>
              <path fill="currentColor" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10-10-4.477 10-10 10zm-.997-6 7.07-7.071-1.414-1.414-5.656 5.657-2.829-2.829-1.414 1.414L11.003 16z"/>
            </svg>
            <div>
              <p>Quality Gate Passed</p>
              <small class="quality-gate__details">Click for details</small>
            </div>
          </div>`;
      default:
        return `
          <div class="quality-gate__badge" title="${description}">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
              <path fill="none" d="M0 0h24v24H0z"/>
              <path fill="currentColor" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10-10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-1-5h2v2h-2v-2zm0-8h2v6h-2V7z"/>
            </svg>
            <div>
              <p>Quality Gate Unknown</p>
              <small class="quality-gate__details">Click for details</small>
            </div>
          </div>`;
    }
  }

  function addCardEventListeners() {
    document.querySelectorAll('.quick-stats__list-item').forEach(card => {
      card.addEventListener('click', () => {
        const metric = card.dataset.metric;
        vscode.postMessage({
          type: 'metricClick',
          metric: metric
        });
      });

      card.addEventListener('mouseenter', showTooltip);
      card.addEventListener('mouseleave', hideTooltip);
    });
  }

  function showTooltip(event) {
    const card = event.currentTarget;
    const description = card.dataset.description;
    const tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip';
    tooltip.innerText = description;
    document.body.appendChild(tooltip);

    const rect = card.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
    tooltip.style.top = `${rect.top + window.scrollY - tooltip.offsetHeight - 10}px`;
  }

  function hideTooltip() {
    const tooltip = document.querySelector('.custom-tooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }

  function animateCards() {
    const cards = document.querySelectorAll('.quick-stats__list-item');
    cards.forEach((card, index) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      setTimeout(() => {
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, index * 50);
    });
  }

  function updateProjectInfo(payload) {
    const projectInfo = document.getElementById('project-info');
    if (projectInfo && payload.component) {
      projectInfo.innerHTML = `
        <div class="project-name">${payload.component.name}</div>
        <div class="project-key">${payload.component.key}</div>
      `;
    }
  }

  function getMetricIndicator(metric, value) {
    if (metric === 'coverage') {
      if (value < 40) return '⚠️'; // Warning for very low coverage
      if (value < 60) return '⚡'; // Needs improvement
      if (value >= 80) return '🎯'; // Good coverage
      return '';
    }
    if (metric === 'duplicated_lines_density') {
      if (value > 10) return '⚠️'; // Warning for high duplication
      if (value <= 3) return '✨'; // Good - low duplication
      return '';
    }
    return '';
  }

  function getComplexityIndicator(value) {
    if (value > 100) return '🔥'; // Very high complexity
    if (value > 50) return '⚠️';  // High complexity
    if (value <= 20) return '✨';  // Good complexity
    return '';
  }

  function getQualityGateDescription(status) {
    switch (status) {
      case 'ERROR':
        return `Quality Gate Failed - One or more metrics didn't meet the quality criteria:\n• Coverage (38.8%) is below the required threshold\n• ${getSummaryOfIssues()}`;
      case 'OK':
        return 'Quality Gate Passed - All quality criteria have been met';
      default:
        return 'Quality Gate status is unknown';
    }
  }

  function getSummaryOfIssues() {
    const criticalIssues = [];
    if (parseFloat(findMetricValue('coverage')) < 40) {
      criticalIssues.push('Low test coverage');
    }
    if (parseInt(findMetricValue('code_smells')) > 0) {
      criticalIssues.push(`${findMetricValue('code_smells')} code smells detected`);
    }
    if (parseFloat(findMetricValue('duplicated_lines_density')) > 3) {
      criticalIssues.push(`${findMetricValue('duplicated_lines_density')}% code duplication`);
    }
    return criticalIssues.join('\n• ');
  }

  function findMetricValue(metricName) {
    const measure = previousState?.payload?.measures?.find(m => m.metric === metricName);
    return measure?.value || '0';
  }

  function updateTimeAgo() {
    const lastUpdate = document.getElementById('last-update');
    if (lastUpdate && previousState?.payload?.timestamp) {
      const timeAgo = getTimeAgo(previousState.payload.timestamp);
      lastUpdate.textContent = `Last updated: ${timeAgo}`;
    }
  }

  function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // Update time ago every minute
  setInterval(updateTimeAgo, 60000);
})();
