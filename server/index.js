export default {
  async fetch(request, env){
    if(env?.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response('Spelling Quest assets are unavailable.', {
      status:503,
      headers:{'content-type':'text/plain; charset=utf-8'}
    });
  }
};
