let memberStorage;
async function startPortal() {
  const app=document.getElementById('app');
  const auth = window.$memberstackDom;
  if (!auth?.getCurrentMember) {
    app.textContent = 'Memberstack could not load on this site. Reload to try again.';
    return;
  }
  let failure = 'Memberstack could not verify employee sign-in on this site.';
  try {
    const response = await auth.getCurrentMember();
    if (!response?.data?.id) {
      const button = document.createElement('button');
      button.textContent = 'Sign in to open Projects';
      button.onclick = async () => {
        try {
          await auth.openModal('LOGIN');
          if ((await auth.getCurrentMember()).data?.id) location.reload();
        } catch {
          app.prepend('Employee sign-in could not be completed on this site. ');
        }
      };
      app.replaceChildren(button);
      return;
    }
    const prefix='scg-pm:'+response.data.id+':';
    memberStorage={
      getItem:key=>localStorage.getItem(prefix+key),
      setItem:(key,value)=>localStorage.setItem(prefix+key,value),
      removeItem:key=>localStorage.removeItem(prefix+key)
    };
    for(const file of ['project.js','checklist.js','utilization.js','roster.js']){
      failure = 'Could not load ' + file + '. Reload to try again.';
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src=file;
        script.onload=resolve;
        script.onerror=reject;
        document.body.appendChild(script);
      });
    }
  } catch {
    app.textContent=failure;
  }
}
window.addEventListener('load',startPortal);
