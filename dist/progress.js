(() => {
  'use strict';
  const D=window.NEBULA_PROGRESS,$=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(!D)return;
  const latest=[...D.milestones].reverse().find(m=>m.metrics);
  function patientChart(){
    const max=Math.max(...D.milestones.map(m=>m.availablePatients),1),base=150,bar=70,gap=38;
    return `<svg class="progress-svg" viewBox="0 0 520 190" role="img" aria-label="Patient count available at each date rose from zero in June to ${latest.availablePatients} in October"><line x1="35" y1="${base}" x2="500" y2="${base}" class="chart-axis"/>${D.milestones.map((m,i)=>{const x=55+i*(bar+gap),h=m.availablePatients/max*105,y=base-h;return `<g><rect x="${x}" y="${y}" width="${bar}" height="${h}" rx="4" class="patient-bar"/><text x="${x+bar/2}" y="${Math.max(20,y-8)}" class="chart-value">${m.availablePatients}</text><text x="${x+bar/2}" y="174" class="chart-label">${esc(m.shortDate)}</text></g>`;}).join('')}</svg>`;
  }
  function outcomeChart(){
    const points=D.milestones.filter(m=>m.metrics),xs=points.map((_,i)=>85+i*(350/Math.max(points.length-1,1))),y=value=>145-value*1.15;
    const values=points.map(m=>m.top3DiagnosisPercent);
    return `<svg class="progress-svg" viewBox="0 0 520 190" role="img" aria-label="Top 3 score for all four models evaluated on the same 65-patient cohort">${[0,25,50,75,100].map(v=>`<g><line x1="45" y1="${y(v)}" x2="485" y2="${y(v)}" class="chart-grid"/><text x="38" y="${y(v)+4}" class="chart-tick">${v}%</text></g>`).join('')}<polyline points="${values.map((v,i)=>`${xs[i]},${y(v)}`).join(' ')}" class="trend-line top3-line"/>${values.map((v,i)=>`<g><circle cx="${xs[i]}" cy="${y(v)}" r="6" class="top3-line"/><text x="${xs[i]}" y="${y(v)-11}" class="chart-value">${v.toFixed(1)}%</text></g>`).join('')}${points.map((m,i)=>`<text x="${xs[i]}" y="174" class="chart-label">${esc(m.shortDate)}</text>`).join('')}</svg>`;
  }
  function render(){
    $('patient-growth-chart').innerHTML=patientChart();$('outcome-trend-chart').innerHTML=outcomeChart();
  }
  document.addEventListener('nebula:progress-open',render);render();
})();
