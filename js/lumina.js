(() => {
  'use strict';
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const root = document.body.dataset.root || '/';
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const wallpaper=$('#wallpaper-video'),cover=$('.cover'),shell=$('#blog');
  if(wallpaper){
    if(!reducedMotion.matches){wallpaper.src=wallpaper.dataset.src;wallpaper.muted=true;wallpaper.play().catch(()=>{});}
    wallpaper.addEventListener('error',()=>{wallpaper.style.opacity='0';});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)wallpaper.pause();else if(!reducedMotion.matches)wallpaper.play().catch(()=>{});});
    reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)wallpaper.pause();else{if(!wallpaper.getAttribute('src'))wallpaper.src=wallpaper.dataset.src;wallpaper.play().catch(()=>{});}});
  }
  if(cover){
    const enterBlog=()=>window.scrollTo({top:cover.offsetTop+cover.offsetHeight-24,behavior:reducedMotion.matches?'instant':'smooth'});
    $('.cover-name').addEventListener('click',enterBlog);
    document.addEventListener('keydown',event=>{if(event.key==='Enter'&&scrollY<cover.offsetHeight*.6&&!event.target.closest('input,textarea,select,button,a,dialog')){event.preventDefault();enterBlog();}});
    let queued=false;
    const updateCover=()=>{const progress=Math.min(1,Math.max(0,scrollY/cover.offsetHeight));document.documentElement.style.setProperty('--cover-progress',String(progress));document.documentElement.style.setProperty('--entry-depth',String(reducedMotion.matches?0:progress));queued=false;};
    addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(updateCover);}},{passive:true});
    addEventListener('resize',updateCover);reducedMotion.addEventListener('change',updateCover);updateCover();
  }
  // A sparse foreground layer stays visible over the glass without catching input.
  const snow=$('#snow'),snowContext=snow?.getContext('2d');
  if(snowContext){
    let flakes=[],w=0,h=0,frame=0,last=0;
    const resizeSnow=()=>{w=innerWidth;h=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.5);snow.width=w*dpr;snow.height=h*dpr;snowContext.setTransform(dpr,0,0,dpr,0,0);const count=Math.max(16,Math.min(46,Math.round(w*h/32000)));flakes=Array.from({length:count},()=>({x:Math.random()*w,y:Math.random()*h,r:1.25+Math.random()*2.1,speed:9+Math.random()*15,phase:Math.random()*6.28,alpha:.35+Math.random()*.4}));};
    const drawSnow=time=>{const delta=Math.min((time-last)/1000||.016,.05);last=time;snowContext.clearRect(0,0,w,h);for(const flake of flakes){flake.phase+=delta*.3;flake.x+=(Math.sin(flake.phase)*4-1)*delta;flake.y+=flake.speed*delta;if(flake.y>h+5){flake.y=-5;flake.x=Math.random()*w;}if(flake.x<-5)flake.x=w+5;snowContext.beginPath();snowContext.fillStyle=`rgba(255,250,255,${flake.alpha})`;snowContext.arc(flake.x,flake.y,flake.r,0,Math.PI*2);snowContext.fill();snowContext.strokeStyle=`rgba(149,186,219,${flake.alpha*.28})`;snowContext.lineWidth=.55;snowContext.stroke();}frame=requestAnimationFrame(drawSnow);};
    const syncSnow=()=>{cancelAnimationFrame(frame);if(!document.hidden&&!reducedMotion.matches){last=0;frame=requestAnimationFrame(drawSnow);}else snowContext.clearRect(0,0,w,h);};
    resizeSnow();syncSnow();addEventListener('resize',resizeSnow);document.addEventListener('visibilitychange',syncSnow);reducedMotion.addEventListener('change',syncSnow);
  }
  const storage = {
    get(key, fallback = null) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  };
  let toastTimer;
  const toast = message => {
    const el = $('.toast'); el.textContent = message; el.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 2500);
  };
  const copy = async text => {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea'); area.value = text; area.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(area); area.select();
    const success = document.execCommand('copy'); area.remove();
    if (!success) throw new Error('Copy unavailable');
  };
  const themeToggle = $('.theme-toggle');
  const syncThemeLabel = () => themeToggle.setAttribute('aria-label', document.documentElement.dataset.theme === 'dark' ? '切换为浅色主题' : '切换为深色主题');
  syncThemeLabel();
  themeToggle.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('lumina-theme', theme); } catch {}
    syncThemeLabel();
  });
  $('.menu-toggle').addEventListener('click', event => {
    const button = event.currentTarget, nav = $('.mobile-nav'), open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open)); button.setAttribute('aria-label', open ? '收起菜单' : '展开菜单'); nav.hidden = !open;
  });
  $$('.to-top').forEach(button => button.addEventListener('click', () => window.scrollTo({top:0, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'})));

  // Article lists: one source of truth for filtering, pagination and saved items.
  const list = $('.post-list');
  let filter = 'all', tag = '', limit = list?.dataset.pageSize ? Number(list.dataset.pageSize) : Infinity;
  const rows = list ? $$('.post-row', list) : [];
  const saved = () => storage.get('lumina-saved', []);
  const updateSavedCount = () => {
    const count = saved().filter(url => rows.some(row => $('.row-content h3 a',row).pathname === url)).length;
    $$('.saved-count').forEach(el => {el.textContent = count;});
  };
  const updateList = () => {
    const bookmarks = saved();
    const matches = rows.filter(row => {
      const kindMatch = filter === 'all' || (filter === 'saved' ? bookmarks.includes($('.row-content h3 a',row).pathname) : row.dataset.kind === filter);
      const tagMatch = !tag || $$('.row-tags a', row).some(a => a.textContent.trim() === '# ' + tag) || row.dataset.tags.split(' ').includes(tag);
      return kindMatch && tagMatch;
    });
    rows.forEach(row => {row.hidden = true;});
    matches.slice(0,limit).forEach(row => {row.hidden = false;});
    $$('[data-filter]').forEach(button => {
      const active = button.dataset.filter === filter && !tag;
      button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active));
    });
    $$('[data-tag]').forEach(button => {
      button.classList.toggle('active',button.dataset.tag === tag); button.setAttribute('aria-pressed',String(button.dataset.tag === tag));
    });
    const more = $('.load-more'), empty = $('.filter-empty'), end = $('.list-end');
    if (more) more.hidden = matches.length <= limit;
    if (empty) empty.hidden = matches.length !== 0;
    if (end) end.hidden = matches.length === 0 || matches.length > limit;
    const title = $('#collection-title');
    if (title) {
      title.textContent = tag ? '# ' + tag : filter === 'all' ? '全部文章' : filter === 'saved' ? '我的收藏' : filter;
      const count = document.createElement('small'); count.textContent = `${matches.length} 篇`; title.append(count);
    }
    updateSavedCount();
  };
  $$('[data-filter]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter; tag = ''; limit = list?.dataset.pageSize ? Number(list.dataset.pageSize) : Infinity; updateList();
  }));
  $$('[data-tag]').forEach(button => button.addEventListener('click', () => {
    tag = tag === button.dataset.tag ? '' : button.dataset.tag; filter = 'all'; updateList();
  }));
  $('.reset-filter')?.addEventListener('click', () => {filter='all';tag='';updateList();});
  $('.load-more')?.addEventListener('click', () => {limit += Number(list.dataset.pageSize);updateList();});
  if (list) updateList();
  const setView = view => {
    list?.classList.toggle('grid-view',view==='grid');
    $$('[data-view]').forEach(button => {const active=button.dataset.view===view;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  };
  $$('[data-view]').forEach(button => button.addEventListener('click', () => {setView(button.dataset.view);storage.set('lumina-view',button.dataset.view);}));
  if ($('[data-view]')) setView(storage.get('lumina-view','list'));

  // Search data never contains protected article bodies.
  const searchDialog = $('.search-dialog'), searchInput = $('#search-input'), results = $('#search-results');
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let searchData = null, request = null;
  const highlight = (text, query) => {
    if (!query) return escapeHTML(text);
    const lower = text.toLocaleLowerCase(), needle = query.toLocaleLowerCase();
    let cursor=0, index, output='';
    while ((index=lower.indexOf(needle,cursor))!==-1) {output+=escapeHTML(text.slice(cursor,index))+'<mark>'+escapeHTML(text.slice(index,index+query.length))+'</mark>';cursor=index+query.length;}
    return output+escapeHTML(text.slice(cursor));
  };
  const renderSearch = () => {
    if (!searchData) return;
    const query = searchInput.value.trim(), words=query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const found = searchData.map(post => {
      const title=post.title.toLocaleLowerCase(),tags=post.tags.join(' ').toLocaleLowerCase(),haystack=(title+' '+tags+' '+post.description+' '+post.text).toLocaleLowerCase();
      return {post,score:words.every(word=>haystack.includes(word)) ? words.reduce((n,word)=>n+(title.includes(word)?10:0)+(tags.includes(word)?5:0)+1,0):0};
    }).filter(item=>!words.length||item.score).sort((a,b)=>b.score-a.score).slice(0,20);
    $('.search-caption').textContent = query ? `找到 ${found.length} 篇相关记录` : '随意翻翻，或搜索标题、标签与正文';
    results.replaceChildren();
    if (!found.length) {const message=document.createElement('p');message.className='search-empty';message.textContent='还没找到这个想法。试试更短的关键词吧。';results.append(message);return;}
    found.forEach(({post})=>{
      const link=document.createElement('a');link.className='search-result';link.href=post.url;
      const source=post.description||post.text; let snippet=source;
      if(query){const at=post.text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());if(at>=0)snippet=(at>25?'…':'')+post.text.slice(Math.max(0,at-25),at+110);}
      link.innerHTML=`<small>${escapeHTML(post.kind)} · ${escapeHTML(post.date)}${post.locked?' · 需密码':''}</small><h3>${highlight(post.title,query)}</h3><p>${highlight(snippet.slice(0,160),query)}</p>`;
      results.append(link);
    });
  };
  const loadSearch = async () => {
    if (searchData) {renderSearch();return;}
    results.innerHTML='<p class="search-empty">正在翻开书架……</p>';
    try {
      request ||= fetch(root+'search.json').then(response=>{if(!response.ok)throw new Error('Unavailable');return response.json();});
      searchData=await request;renderSearch();
    } catch {request=null;results.innerHTML='<p class="search-empty">书架暂时没有连上。关闭后重试，或前往文章页浏览。</p>';}
  };
  const openSearch = () => {if(!searchDialog.open)searchDialog.showModal();searchInput.focus();loadSearch();};
  $$('.search-trigger').forEach(button=>button.addEventListener('click',openSearch));
  $('.search-close').addEventListener('click',()=>searchDialog.close());
  searchInput.addEventListener('input',renderSearch);
  searchInput.addEventListener('keydown',event=>{if(event.key==='Enter'&&$('.search-result',results)){event.preventDefault();$('.search-result',results).click();}});
  searchDialog.addEventListener('click',event=>{if(event.target===searchDialog){const r=searchDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)searchDialog.close();}});
  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLocaleLowerCase()==='k'){event.preventDefault();openSearch();}});

  const music=$('#blog-music'),musicToggle=$('.music-toggle');
  if(music&&musicToggle){music.volume=.35;const syncMusic=()=>{const playing=!music.paused;musicToggle.classList.toggle('music-playing',playing);musicToggle.setAttribute('aria-pressed',String(playing));musicToggle.setAttribute('aria-label',playing?'暂停博客音乐':'播放博客原音乐');musicToggle.innerHTML=playing?'<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M3 2h2v8H3zm4 0h2v8H7z"/></svg>':'<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M3 1.5 10 6 3 10.5Z"/></svg>';};musicToggle.addEventListener('click',()=>{if(music.paused)music.play().catch(()=>toast('音乐暂时无法播放，请稍后再试。'));else music.pause();});music.addEventListener('play',syncMusic);music.addEventListener('pause',syncMusic);}

  const lightbox=$('.lightbox');
  const showImage=(url,caption)=>{const img=$('img',lightbox);img.src=url;img.alt=caption;$('p',lightbox).textContent=caption;lightbox.showModal();};
  $$('[data-image]').forEach(button=>button.addEventListener('click',()=>showImage(button.dataset.image,button.dataset.caption)));
  $('.lightbox-close').addEventListener('click',()=>lightbox.close());
  lightbox.addEventListener('click',event=>{if(event.target===lightbox)lightbox.close();});
  $$('[data-week]').forEach(button=>button.addEventListener('click',()=>{
    $$('[data-week]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    $('#week-caption').textContent=button.dataset.week==='odd'?'单周课程':'双周课程';
    $('.schedule-sheet').dataset.week=button.dataset.week;
  }));

  const uploadData=$('#upload-data');
  if(uploadData){
    const records=JSON.parse(uploadData.textContent),yearSelect=$('#upload-year'),grid=$('.contribution-grid'),months=$('.contribution-months'),status=$('#upload-status'),detail=$('#upload-detail');
    const localDate=date=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
    const today=localDate(new Date()),currentYear=Number(today.slice(0,4));
    const years=[...new Set([currentYear,...records.map(record=>Number(localDate(record.date).slice(0,4)))])].sort((a,b)=>b-a);
    years.forEach(year=>{const option=document.createElement('option');option.value=year;option.textContent=year;yearSelect.append(option);});
    const byDay=new Map();records.forEach(record=>{const day=localDate(record.date);if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(record);});
    const describe=day=>`${day.replace(/-/g,'.')} · ${(byDay.get(day)||[]).length} 次上传`;
    const showDay=button=>{
      const day=button.dataset.day,entries=byDay.get(day)||[];status.textContent=describe(day);detail.replaceChildren();
      $$('.contribution-day[aria-pressed=true]').forEach(el=>el.setAttribute('aria-pressed','false'));button.setAttribute('aria-pressed','true');
      detail.hidden=!entries.length;
      entries.forEach(record=>{const link=document.createElement('a');link.href='https://github.com/Nuoziy/Nuoziy.github.io/commit/'+record.sha;link.target='_blank';link.rel='noopener noreferrer';const label=document.createElement('span'),sha=document.createElement('code');label.textContent=record.subject.startsWith('Site updated:')?'更新博客':record.subject==='First commit'?'首次上传':record.subject==='Create CNAME'?'更新域名配置':record.subject;sha.textContent=record.sha.slice(0,7)+' ↗';link.append(label,sha);detail.append(link);});
    };
    let restartSnake=()=>{};
    const renderYear=()=>{
      const year=Number(yearSelect.value),first=new Date(Date.UTC(year,0,1)),lastDate=new Date(Date.UTC(year,11,31)),days=Math.round((lastDate-first)/86400000)+1,offset=first.getUTCDay(),weeks=Math.ceil((offset+days)/7);
      const uploads=records.filter(record=>localDate(record.date).startsWith(String(year))).length;
      $('.upload-total').textContent=`${uploads} 次上传`;
      grid.style.setProperty('--weeks',weeks);months.style.setProperty('--weeks',weeks);grid.replaceChildren();months.replaceChildren();detail.hidden=true;
      status.textContent='根据博客仓库的真实提交记录生成';
      for(let month=0;month<12;month++){const date=new Date(Date.UTC(year,month,1)),day=Math.round((date-first)/86400000),label=document.createElement('span');label.textContent=(month+1)+'月';label.style.gridColumn=String(Math.floor((offset+day)/7)+1);months.append(label);}
      for(let i=0;i<weeks*7;i++){
        const number=i-offset,button=document.createElement('button');button.className='contribution-day';
        if(number<0||number>=days){button.classList.add('spacer');button.disabled=true;button.setAttribute('aria-hidden','true');grid.append(button);continue;}
        const day=new Date(Date.UTC(year,0,number+1)).toISOString().slice(0,10),count=(byDay.get(day)||[]).length;
        button.dataset.day=day;button.dataset.level=String(Math.min(4,count));button.title=describe(day);button.setAttribute('aria-label',describe(day));button.setAttribute('aria-pressed','false');button.tabIndex=-1;
        if(day>today){button.classList.add('future');button.disabled=true;}
        else{button.addEventListener('click',()=>showDay(button));button.addEventListener('pointerenter',()=>status.textContent=describe(day));button.addEventListener('focus',()=>status.textContent=describe(day));}
        grid.append(button);
      }
      const squares=$$('.contribution-day:not(:disabled)',grid),latest=squares.filter(button=>Number(button.dataset.level)>0).at(-1)||squares.at(-1);if(latest)latest.tabIndex=0;restartSnake();
      requestAnimationFrame(()=>{const scroller=$('.contribution-scroll');scroller.scrollLeft=Math.max(0,(latest?.offsetLeft||0)-scroller.clientWidth*.65);});
    };
    yearSelect.addEventListener('change',renderYear);
    grid.addEventListener('keydown',event=>{const moves={ArrowLeft:-7,ArrowRight:7,ArrowUp:-1,ArrowDown:1};if(!(event.key in moves)&&!['Home','End'].includes(event.key))return;const buttons=$$('.contribution-day:not(:disabled)',grid),index=buttons.indexOf(event.target);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.min(buttons.length-1,Math.max(0,index+moves[event.key]));buttons[index].tabIndex=-1;buttons[next].tabIndex=0;buttons[next].focus();});
    renderYear();
    // A trail of fixed grid squares: movement is expressed through scale and colour.
    const snakeLayer=document.createElement('div');snakeLayer.className='contribution-snake';snakeLayer.setAttribute('aria-hidden','true');grid.append(snakeLayer);
    const legend=$('.contribution-legend'),toggle=document.createElement('button');toggle.className='snake-toggle';toggle.setAttribute('aria-label','暂停小蛇');toggle.setAttribute('aria-pressed','false');toggle.innerHTML='<svg width="22" height="15" viewBox="0 0 28 18" fill="currentColor" aria-hidden="true"><rect x="2" y="10" width="5" height="5" rx="1" opacity=".35"/><rect x="8" y="10" width="5" height="5" rx="1" opacity=".55"/><rect x="14" y="10" width="5" height="5" rx="1" opacity=".7"/><rect x="18" y="2" width="9" height="9" rx="1.5"/></svg>';legend.prepend(toggle);
    let cells=[],snake=[],direction=[1,0],timer=0,hover=false,manualPause=false,inView=true,step=0;
    const interval=460;
    const indexAt=(column,row)=>cells.findIndex(cell=>cell.col===column&&cell.row===row);
    const paintSnake=()=>{
      const positions=new Map(snake.map((index,i)=>[index,i]));
      cells.forEach((cell,index)=>{
        const position=positions.get(index),active=position!==undefined;
        cell.block.classList.toggle('active',active);cell.block.classList.toggle('head',position===0);
        if(!active){cell.block.style.setProperty('--block-scale','.45');cell.block.style.opacity='0';return;}
        const strength=1-position/Math.max(1,snake.length),hueMix=Math.max(0,Math.min(1,strength*.85+Math.sin(step*.3)*.12));
        const blue=[155,181,211],pink=[202,156,190],color=blue.map((value,i)=>Math.round(value+(pink[i]-value)*hueMix));
        cell.block.style.backgroundColor=`rgb(${color.join(',')})`;
        cell.block.style.opacity=String(.28+strength*.6);
        cell.block.style.setProperty('--block-scale',position===0?'1.52':String(.86+strength*.28));
        cell.block.style.zIndex=position===0?'2':'1';
      });
    };
    const measureSnake=()=>{
      snakeLayer.replaceChildren();const children=[...grid.children];
      cells=$$('.contribution-day[data-day]',grid).map(button=>{
        const i=children.indexOf(button),block=document.createElement('span');block.className='snake-block';block.style.left=(button.offsetLeft+button.offsetWidth/2)+'px';block.style.top=(button.offsetTop+button.offsetHeight/2)+'px';block.style.width=button.offsetWidth+'px';block.style.height=button.offsetHeight+'px';snakeLayer.append(block);
        return{col:Math.floor(i/7),row:i%7,block};
      });
      const startColumn=Math.min(38,Math.floor(Number(grid.style.getPropertyValue('--weeks'))*.7));
      snake=Array.from({length:9},(_,i)=>indexAt(startColumn-i,3)).filter(i=>i>=0);direction=[1,0];step=0;paintSnake();
    };
    const advanceSnake=()=>{
      const head=cells[snake[0]];if(!head)return;
      const directions=[[1,0],[0,1],[-1,0],[0,-1]],available=directions.map(d=>({d,i:indexAt(head.col+d[0],head.row+d[1])})).filter(choice=>choice.i>=0&&!snake.slice(0,-1).includes(choice.i));
      const straight=available.find(choice=>choice.d[0]===direction[0]&&choice.d[1]===direction[1]),next=straight&&Math.random()>.3?straight:available[Math.floor(Math.random()*available.length)];
      if(!next){snake.reverse();direction=[-direction[0],-direction[1]];paintSnake();return;}
      snake.unshift(next.i);if(snake.length>9)snake.pop();direction=next.d;step++;paintSnake();
    };
    const syncSnake=()=>{clearInterval(timer);snakeLayer.classList.toggle('resting',hover||manualPause);if(!document.hidden&&!reducedMotion.matches&&!hover&&!manualPause&&inView)timer=setInterval(advanceSnake,interval);};
    restartSnake=()=>{if(!snakeLayer.isConnected)grid.append(snakeLayer);measureSnake();syncSnake();};restartSnake();
    toggle.addEventListener('click',()=>{manualPause=!manualPause;toggle.setAttribute('aria-pressed',String(manualPause));toggle.setAttribute('aria-label',manualPause?'继续小蛇动画':'暂停小蛇');syncSnake();});
    const container=$('.contribution-container');container.addEventListener('pointerenter',()=>{hover=true;syncSnake();});container.addEventListener('pointerleave',()=>{hover=false;syncSnake();});
    grid.addEventListener('focusin',()=>{hover=true;syncSnake();});grid.addEventListener('focusout',event=>{if(!grid.contains(event.relatedTarget)){hover=false;syncSnake();}});
    new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;syncSnake();},{rootMargin:'100px'}).observe(grid);
    addEventListener('resize',restartSnake);document.addEventListener('visibilitychange',syncSnake);reducedMotion.addEventListener('change',syncSnake);

  }

  const article=$('.article-body');
  if(!article) return;
  const setupCode=()=>{
    $$('figure.highlight',article).forEach(figure=>{
      if($('.code-header',figure))return;
      const header=document.createElement('div');header.className='code-header';
      const language=document.createElement('span');language.textContent=[...figure.classList].find(c=>c!=='highlight')?.toUpperCase()||'CODE';
      const button=document.createElement('button');button.className='code-copy';button.textContent='复制代码';button.setAttribute('aria-label','复制这段代码');
      button.addEventListener('click',async()=>{try{await copy($('.code pre',figure)?.textContent||$('pre',figure)?.textContent||'');button.textContent='已复制 ✓';setTimeout(()=>button.textContent='复制代码',2000);}catch{toast('未能自动复制，请选中代码复制。');}});
      header.append(language,button);figure.prepend(header);
    });
    $$('img',article).forEach(img=>{
      if(img.dataset.zoomReady)return;img.dataset.zoomReady='true';img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','放大图片：'+(img.alt||'文章配图'));
      img.addEventListener('click',()=>showImage(img.src,img.alt));img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showImage(img.src,img.alt);}});
    });
  };
  setupCode();
  let headings=[],tocLinks=[];
  const setupToc=()=>{headings=$$('h1[id],h2[id],h3[id]',article);tocLinks=$$('#article-toc a,.mobile-toc a');};
  setupToc();
  $$('.mobile-toc a').forEach(link=>link.addEventListener('click',()=>{$('.mobile-toc').open=false;}));
  window.addEventListener('hexo-blog-decrypt',()=>{
    setupCode();
    const nav=$('#article-toc');nav.replaceChildren();const ol=document.createElement('ol');ol.className='toc';
    $$('h1,h2,h3',article).forEach((heading,i)=>{if(!heading.id)heading.id='section-'+i;const li=document.createElement('li'),a=document.createElement('a');a.href='#'+encodeURIComponent(heading.id);a.textContent=heading.textContent;li.append(a);ol.append(li);});
    nav.append(ol);const mobile=$('.mobile-toc nav');if(mobile)mobile.replaceChildren(ol.cloneNode(true));setupToc();
  });
  const sizeButton=$('.type-size');
  let fontSize=storage.get('lumina-font-size',16);
  const applySize=()=>document.documentElement.style.setProperty('--article-size',fontSize+'px');applySize();
  sizeButton?.addEventListener('click',()=>{fontSize=fontSize>=20?16:fontSize+2;applySize();storage.set('lumina-font-size',fontSize);toast(`正文字号：${fontSize}px`);});
  $('.focus-toggle')?.addEventListener('click',event=>{
    const active=document.body.classList.toggle('focus-mode');event.currentTarget.setAttribute('aria-pressed',String(active));event.currentTarget.setAttribute('aria-label',active?'退出专注阅读':'专注阅读');toast(active?'已进入专注阅读，点击相同按钮退出。':'已退出专注阅读');
  });
  const bookmark=$('.bookmark-toggle');
  const syncBookmark=()=>{const active=saved().includes(location.pathname);bookmark?.setAttribute('aria-pressed',String(active));bookmark?.setAttribute('aria-label',active?'取消收藏这篇文章':'收藏这篇文章');};syncBookmark();
  bookmark?.addEventListener('click',()=>{const all=saved(),index=all.indexOf(location.pathname);if(index>=0)all.splice(index,1);else all.push(location.pathname);storage.set('lumina-saved',all);syncBookmark();toast(index>=0?'已从收藏中移除。':'已收藏，可在文章书架中找到。');});
  $('.share-button')?.addEventListener('click',async()=>{try{await copy(location.origin+location.pathname);toast('文章链接已复制。');}catch{toast('暂时无法自动复制，请从地址栏复制链接。');}});
  let tick=false,saveTimer;
  const updateReading=()=>{
    const rect=article.getBoundingClientRect(),height=Math.max(1,article.scrollHeight-innerHeight*.65),progress=Math.max(0,Math.min(100,(-rect.top+innerHeight*.2)/height*100));
    $('.reading-progress').style.width=progress+'%';if($('#reading-percent'))$('#reading-percent').textContent=Math.round(progress);
    let active=headings[0];headings.forEach(h=>{if(h.getBoundingClientRect().top<innerHeight*.3)active=h;});
    tocLinks.forEach(link=>{let id='';try{id=decodeURIComponent(link.hash.slice(1));}catch{}link.classList.toggle('active',id===active?.id);});
    clearTimeout(saveTimer);saveTimer=setTimeout(()=>storage.set('lumina-position:'+location.pathname,scrollY),300);tick=false;
  };
  addEventListener('scroll',()=>{if(!tick){tick=true;requestAnimationFrame(updateReading);}},{passive:true});
  addEventListener('resize',updateReading);updateReading();
  const position=storage.get('lumina-position:'+location.pathname,0);
  if(!location.hash&&position>innerHeight&&position<document.documentElement.scrollHeight-innerHeight-100){
    requestAnimationFrame(()=>{window.scrollTo({top:position,behavior:'instant'});toast('已回到上次读到的位置。');});
  }
})();
