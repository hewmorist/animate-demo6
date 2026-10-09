// SoundCloud's official Widget API; audio is streamed, never rehosted.
export function createSoundtrack(onPause){
 const status=document.getElementById('soundtrackStatus'),enabled=document.getElementById('soundtrackSync');
 let widget=null,ready=false,playing=false,pending=null,timer=null,probe=null,lastPosition=null,attempt=0;
 function settle(ok){clearTimeout(timer);clearInterval(probe);timer=null;probe=null;const done=pending;pending=null;if(done)done(ok);}
 function pause(){const active=playing||pending;attempt++;playing=false;settle(false);if(active&&widget)widget.pause();}
 function observe(ms){if(!pending||!Number.isFinite(ms)||ms<0)return;
 // PLAY can precede a startup PAUSE on iPhone. Moving audio proves it started.
 if(lastPosition!==null&&ms-lastPosition>=60){playing=true;status.textContent='Eigenbeing playing.';settle(true);return;}
 if(lastPosition===null||ms<lastPosition)lastPosition=ms;
 }
 function init(){if(!window.SC?.Widget){status.textContent='SoundCloud could not load. Reload to try again.';return;}widget=window.SC.Widget(document.getElementById('soundtrackPlayer'));const E=window.SC.Widget.Events;
 widget.bind(E.READY,()=>{widget.getCurrentSound(sound=>{if(Number(sound?.id)!==2401193031){status.textContent='SoundCloud has not loaded Eigenbeing. Reload to try again.';return;}widget.getDuration(duration=>{if(!Number.isFinite(duration)||duration<=0){status.textContent='SoundCloud has not loaded the track duration. Reload to try again.';return;}ready=true;status.textContent='Track ready. Play starts the music and animation.';});});});
 widget.bind(E.PLAY_PROGRESS,e=>observe(e?.currentPosition));
 widget.bind(E.PAUSE,()=>{if(pending||!playing)return;const current=attempt;
 widget.isPaused(paused=>{if(!paused||current!==attempt||pending||!playing)return;playing=false;status.textContent='Track paused.';onPause();});
 });
 widget.bind(E.FINISH,()=>{playing=false;settle(false);status.textContent='Track finished · animation continues to its end.';});
 widget.bind(E.ERROR,()=>{ready=false;pause();status.textContent='SoundCloud could not play this track. Reload to try again.';onPause();});
 }
 const script=document.createElement('script');script.src='https://w.soundcloud.com/player/api.js';script.onload=init;script.onerror=init;document.head.append(script);
 enabled.onchange=()=>{if(!enabled.checked)pause();};
 return {pause,retry(){if(ready&&pending)widget.play();},startAt(seconds){if(!enabled.checked)return Promise.resolve(true);if(!ready){status.textContent='Wait for the track to load, then press Play.';return Promise.resolve(false);}pause();lastPosition=null;return new Promise(resolve=>{
 pending=resolve;status.textContent='Starting Eigenbeing…';const current=attempt,started=performance.now();let retries=0;
 timer=setTimeout(()=>{pause();status.textContent='SoundCloud did not start. Press Play again to enable audio.';onPause();},5000);
 probe=setInterval(()=>{if(!pending||current!==attempt)return;widget.getPosition(ms=>{if(current===attempt)observe(ms);});if(/iPhone|iPod/.test(navigator.userAgent)&&performance.now()-started>900*(retries+1)&&retries<3){retries++;widget.play();}},180);
 widget.seekTo(Math.max(0,seconds)*1000);widget.play();
 });}};
}
