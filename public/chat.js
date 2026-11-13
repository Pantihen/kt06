/* Демо-клиент: логин через REST (/auth/login), затем Socket.io с JWT в auth.token */
(() => {
  const $ = (id) => document.getElementById(id);
  const state = { socket: null, me: null, current: '', rooms: new Map([['', []]]), unread: new Map() };

  function el(tag, { dataset, ...props } = {}, children = []) {
    const node = Object.assign(document.createElement(tag), props);
    if (dataset) Object.assign(node.dataset, dataset);
    node.append(...children);
    return node;
  }

  // Ответы сервера (REST и Socket.io): { success, data } / { success: false, error: { message, details } }
  const errorText = (error) => error?.details?.[0]?.message || error?.message;

  // ---------- авторизация ----------
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('login-error').textContent = '';
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('email').value, password: $('password').value }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      $('login-error').textContent = errorText(body.error) || `Ошибка ${res.status}`;
      return;
    }
    state.me = body.data.user;
    connect(body.data.accessToken);
  });

  $('logout').addEventListener('click', async () => {
    state.socket?.disconnect();
    await fetch('/auth/logout', { method: 'POST' });
    location.reload();
  });

  // ---------- сокет ----------
  function connect(token) {
    $('login-view').classList.add('hidden');
    $('chat-view').classList.remove('hidden');
    $('me').textContent = `${state.me.name} (${state.me.role})`;

    const socket = io({ auth: { token } });
    state.socket = socket;

    socket.on('connect', () => setStatus('онлайн'));
    socket.on('disconnect', () => setStatus('отключено'));
    socket.on('connect_error', (err) => setStatus(`ошибка: ${err.message}`));

    socket.on('users:online', (users) => renderOnline(users));
    socket.on('user:online', (user) => {
      addOnline(user);
      system('', `${user.name} в сети`);
    });
    socket.on('user:offline', (user) => {
      $(`u-${user.id}`)?.remove();
      system('', `${user.name} вышел из сети`);
    });

    socket.on('message:new', (msg) => addMessage('', msg));
    socket.on('room:message', (msg) => addMessage(msg.room, msg));
    socket.on('room:user-joined', ({ room, user }) => system(room, `${user.name} вошёл в комнату`));
    socket.on('room:user-left', ({ room, user }) => system(room, `${user.name} покинул комнату`));

    loadGlobalHistory(token);
  }

  async function loadGlobalHistory(token) {
    const res = await fetch('/api/messages?limit=50', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const { data } = await res.json();
    state.rooms.set('', data.reverse());
    if (state.current === '') renderMessages();
  }

  const setStatus = (text) => { $('status').textContent = text; };

  // ---------- онлайн ----------
  function renderOnline(users) {
    $('online').replaceChildren();
    users.forEach(addOnline);
  }
  function addOnline(user) {
    if ($(`u-${user.id}`)) return;
    $('online').append(el('li', { id: `u-${user.id}`, textContent: `${user.name}${user.id === state.me.id ? ' (вы)' : ''}` }));
  }

  // ---------- комнаты ----------
  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const room = $('room-name').value.trim();
    state.socket.emit('room:join', { room }, (res) => {
      if (!res.success) return alert(errorText(res.error));
      state.rooms.set(room, res.data.history);
      if (!document.querySelector(`.room[data-room="${CSS.escape(room)}"]`)) {
        $('rooms').append(el('li', {}, [el('button', { className: 'room', textContent: `# ${room}`, dataset: { room } })]));
      }
      $('room-name').value = '';
      switchRoom(room);
    });
  });

  $('rooms').addEventListener('click', (e) => {
    const btn = e.target.closest('.room');
    if (btn) switchRoom(btn.dataset.room);
  });

  $('leave-room').addEventListener('click', () => {
    const room = state.current;
    state.socket.emit('room:leave', { room }, (res) => {
      if (!res.success) return alert(errorText(res.error));
      state.rooms.delete(room);
      document.querySelector(`.room[data-room="${CSS.escape(room)}"]`)?.parentElement.remove();
      switchRoom('');
    });
  });

  function switchRoom(room) {
    state.current = room;
    state.unread.delete(room);
    document.querySelectorAll('.room').forEach((b) => {
      b.classList.toggle('active', b.dataset.room === room);
      if (b.dataset.room === room) b.querySelector('.badge')?.remove();
    });
    $('current-room').textContent = room ? `# ${room}` : '# общий';
    $('leave-room').classList.toggle('hidden', room === '');
    renderMessages();
  }

  // ---------- сообщения ----------
  $('message-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const content = $('message').value;
    const room = state.current;
    const [event, payload] = room ? ['room:message', { room, content }] : ['message:send', { content }];
    state.socket.emit(event, payload, (res) => {
      if (!res.success) return alert(errorText(res.error));
      $('message').value = '';
    });
  });

  function addMessage(room, item) {
    if (!state.rooms.has(room)) return;
    state.rooms.get(room).push(item);
    if (room === state.current) {
      $('messages').append(renderItem(item));
      $('messages').scrollTop = $('messages').scrollHeight;
    } else {
      const count = (state.unread.get(room) || 0) + 1;
      state.unread.set(room, count);
      const btn = document.querySelector(`.room[data-room="${CSS.escape(room)}"]`);
      if (btn) {
        btn.querySelector('.badge')?.remove();
        btn.append(el('span', { className: 'badge', textContent: String(count) }));
      }
    }
  }

  const system = (room, text) => addMessage(room, { system: true, text });

  function renderItem(item) {
    if (item.system) return el('li', { className: 'system', textContent: item.text });
    const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return el('li', {}, [
      el('span', { className: 'author', textContent: item.author.name }),
      document.createTextNode(item.content),
      el('time', { textContent: time }),
    ]);
  }

  function renderMessages() {
    $('messages').replaceChildren(...(state.rooms.get(state.current) || []).map(renderItem));
    $('messages').scrollTop = $('messages').scrollHeight;
  }
})();
