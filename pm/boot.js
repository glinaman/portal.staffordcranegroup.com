let memberStorage;
async function startPortal() {
  const app=document.getElementById('app');
  try {
    const response=await window._memberstack.getCurrentMember();
    if (!response?.data?.id) {
      app.textContent='Sign in to the employee portal to open Projects.';
      return;
    }
    const prefix='scg-pm:'+response.data.id+':';
    memberStorage={
      getItem:key=>localStorage.getItem(prefix+key),
      setItem:(key,value)=>localStorage.setItem(prefix+key,value),
      removeItem:key=>localStorage.removeItem(prefix+key)
    };
    for(const file of ['project.js','checklist.js','utilization.js','roster.js']){
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src=file;
        script.onload=resolve;
        script.onerror=reject;
        document.body.appendChild(script);
      });
    }
  } catch {
    app.textContent='Could not open Projects. Check your employee portal sign-in and reload.';
  }
}
window.addEventListener('load',startPortal);
