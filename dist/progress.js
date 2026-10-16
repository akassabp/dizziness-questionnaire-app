(() => {
  'use strict';
  const D=window.NEBULA_PROGRESS,$=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(!D)return;
  function lineChart({values,min,max,ticks,suffix='',lineClass,label}){
    const items=D.milestones,x=i=>82+i*(420/Math.max(items.length-1,1)),top=42,bottom=232,height=bottom-top,y=value=>bottom-(value-min)/(max-min)*height;
    const points=values.map((value,i)=>`${x(i)},${y(value)}`).join(' ');
    return `<svg class="progress-svg" viewBox="0 0 585 290" role="img" aria-label="${esc(label)} across four model milestones">
      ${ticks.map(tick=>`<g><line x1="58" y1="${y(tick)}" x2="530" y2="${y(tick)}" class="chart-grid"/><text x="48" y="${y(tick)+4}" class="chart-tick chart-tick-left">${tick}${suffix}</text></g>`).join('')}
      <polyline points="${points}" class="progress-line ${lineClass}"/>
      ${values.map((value,i)=>`<g><circle cx="${x(i)}" cy="${y(value)}" r="5" class="${lineClass}-point"/><text x="${x(i)}" y="${Math.max(top+10,y(value)-12)}" class="chart-value ${lineClass}-value">${value}${suffix}</text><text x="${x(i)}" y="266" class="chart-label">${esc(items[i].shortDate)}</text></g>`).join('')}
    </svg>`;
  }
  function render(){
    $('patient-growth-chart').innerHTML=lineChart({values:D.milestones.map(m=>m.availablePatients),min:0,max:80,ticks:[0,20,40,60,80],lineClass:'patient',label:'Labeled patient growth'});
    $('top3-progress-chart').innerHTML=lineChart({values:D.milestones.map(m=>m.top3DiagnosisPercent),min:55,max:75,ticks:[55,60,65,70,75],suffix:'%',lineClass:'top3',label:'Top 3 score'});
  }
  document.addEventListener('nebula:progress-open',render);render();
})();
