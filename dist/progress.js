(() => {
  'use strict';
  const D=window.NEBULA_PROGRESS,$=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(!D)return;
  function chart(){
    const items=D.milestones,x=i=>110+i*(580/Math.max(items.length-1,1)),top=62,bottom=292,height=bottom-top;
    const patientY=value=>bottom-value/80*height,scoreY=value=>bottom-value/100*height;
    const patientPoints=items.map((m,i)=>`${x(i)},${patientY(m.availablePatients)}`).join(' ');
    const scorePoints=items.map((m,i)=>`${x(i)},${scoreY(m.top3DiagnosisPercent)}`).join(' ');
    const ticks=[0,25,50,75,100];
    return `<svg class="progress-svg" viewBox="0 0 800 360" role="img" aria-label="Labeled patient growth and Top 3 score across four model milestones. Patient count uses the left axis and Top 3 percentage uses the right axis.">
      <g class="chart-legend"><line x1="270" y1="28" x2="300" y2="28" class="patient-line"/><circle cx="285" cy="28" r="4" class="patient-point"/><text x="308" y="32">Labeled patients</text><line x1="445" y1="28" x2="475" y2="28" class="top3-line"/><circle cx="460" cy="28" r="4" class="top3-point"/><text x="483" y="32">Top 3 score</text></g>
      ${ticks.map((tick,index)=>{const y=bottom-index*(height/4),patients=index*20;return `<g><line x1="75" y1="${y}" x2="725" y2="${y}" class="chart-grid"/><text x="64" y="${y+4}" class="chart-tick chart-tick-left">${patients}</text><text x="736" y="${y+4}" class="chart-tick chart-tick-right">${tick}%</text></g>`;}).join('')}
      <text x="22" y="178" class="axis-title" transform="rotate(-90 22 178)">Labeled patients</text><text x="778" y="178" class="axis-title" transform="rotate(90 778 178)">Top 3 score</text>
      <polyline points="${patientPoints}" class="patient-line"/><polyline points="${scorePoints}" class="top3-line"/>
      ${items.map((m,i)=>`<g><circle cx="${x(i)}" cy="${patientY(m.availablePatients)}" r="5" class="patient-point"/><text x="${x(i)}" y="${Math.max(top+10,patientY(m.availablePatients)-11)}" class="chart-value patient-value">${m.availablePatients}</text><circle cx="${x(i)}" cy="${scoreY(m.top3DiagnosisPercent)}" r="5" class="top3-point"/><text x="${x(i)}" y="${scoreY(m.top3DiagnosisPercent)-11}" class="chart-value top3-value">${m.top3DiagnosisPercent.toFixed(1)}%</text><text x="${x(i)}" y="326" class="chart-label">${esc(m.shortDate)}</text></g>`).join('')}
    </svg>`;
  }
  function render(){$('tracking-progress-chart').innerHTML=chart();}
  document.addEventListener('nebula:progress-open',render);render();
})();
