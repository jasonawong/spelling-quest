export default {
  async fetch(request, env){
    if(env?.ASSETS?.fetch){
      const response = await env.ASSETS.fetch(request);
      const url = new URL(request.url);
      if(url.pathname === '/' || /\/(?:index\.html|sw\.js|island-quest\.(?:js|css)|manifest\.webmanifest)$/.test(url.pathname)){
        const headers = new Headers(response.headers);
        headers.set('cache-control','no-cache, no-store, must-revalidate');
        headers.set('pragma','no-cache');
        headers.set('expires','0');
        return new Response(response.body,{ status:response.status, statusText:response.statusText, headers });
      }
      return response;
    }
    return new Response('Spelling Quest assets are unavailable.', {
      status:503,
      headers:{'content-type':'text/plain; charset=utf-8'}
    });
  }
};
