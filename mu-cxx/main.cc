#include <arpa/inet.h>
#include <asm-generic/socket.h>
#include <cerrno>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <endian.h>
#include <errno.h>
#include <fcntl.h>
#include <map>
#include <memory.h>
#include <memory>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <set>
#include <signal.h>
#include <stdint.h>
#include <stdlib.h>
#include <string>
#include <termios.h>
#include <sys/epoll.h>
#include <sys/fcntl.h>
#include <sys/poll.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>
#include <vector>
#include <pty.h>
typedef struct {
  void *conn_state;
  int32_t self_fid;
  int self_pid;
  int self_fd;
  int is_readable;
  int is_pty;
  int self_real_pid;
} FDState;

typedef int (*PFNSENDDATA)(void *conn_state, uint32_t request_id,
                           uint8_t request_method);
typedef struct __attribute__((packed)) {
  int32_t message_len;
  int32_t message_id;
  int8_t method;
  uint8_t method_payload[];
} Message;
typedef struct {
  std::unique_ptr<std::map<int32_t, FDState *>> fid_to_fd;
  std::unique_ptr<std::map<int32_t, int32_t>> pfid_to_pid;
  std::vector<uint8_t> data_bytes;
  int32_t self_fd;
  PFNSENDDATA send_data_bytes;
  struct sockaddr_in sa_in;
} ConnectionState;

int tcp_send_connection_state(void *conn_state, uint32_t request_id,
                              uint8_t request_method) {
  if (request_method == 7) {
  }
  ConnectionState *cs = (ConnectionState *)conn_state;
  uint8_t *inner_data = cs->data_bytes.data();
  size_t write_len = cs->data_bytes.size();
  size_t to_write_len = write_len + sizeof(Message);

  uint8_t *to_write = (uint8_t *)malloc(to_write_len);
  Message *msg = (Message *)to_write;
  msg->message_len = be32toh(to_write_len);
  msg->message_id = be32toh(request_id);
  msg->method = request_method;
  if (write_len > 0)
    memcpy(msg->method_payload, inner_data, write_len);
  // if (request_method == 5) {

  // }
  size_t written = 0;
  while (written < to_write_len) {
    // FIX: send from correct offset and send only remaining bytes
    int ret = send(cs->self_fd, to_write + written, to_write_len - written, 0);
    if (ret == -1) {
      return errno;
    } else {
      written += ret;
    }
  }
  free(to_write);
  cs->data_bytes.clear();
  return 0;
}
int hvc_send_state(void *conn_state, uint32_t request_id,
                              uint8_t request_method) {
  if (request_method == 7) {
  }
  ConnectionState *cs = (ConnectionState *)conn_state;
  uint8_t *inner_data = cs->data_bytes.data();
  size_t write_len = cs->data_bytes.size();
  size_t to_write_len = write_len + sizeof(Message);

  uint8_t *to_write = (uint8_t *)malloc(to_write_len);
  Message *msg = (Message *)to_write;
  msg->message_len = be32toh(to_write_len);
  msg->message_id = be32toh(request_id);
  msg->method = request_method;
  if (write_len > 0)
    memcpy(msg->method_payload, inner_data, write_len);
  // if (request_method == 5) {

  // }
  size_t written = 0;
  while (written < to_write_len) {
    // FIX: send from correct offset and send only remaining bytes
    int ret = write(cs->self_fd, to_write + written, to_write_len - written);
    if (ret == -1) {
      return errno;
    } else {
      written += ret;
    }
  }
  free(to_write);
  cs->data_bytes.clear();
  return 0;
}
static std::map<pid_t, std::set<FDState *>> pids_to_fdstates =
    std::map<pid_t, std::set<FDState *>>();

typedef int (*PFNEPOLLCALLBACK)(int epoll_fd, int epoll_evts, void *user_data);
typedef int (*PFNHANDLEMESSAGE)(ConnectionState *conn_state, int message_id,
                                uint8_t *msg, size_t message_len);

int set_nonblock(int fd) {
  int flags = fcntl(fd, F_GETFL, 0);
  if (flags == -1) {
    perror("fcntl F_GETFL");
    return -1;
  }
  if (fcntl(fd, F_SETFL, flags | O_NONBLOCK) == -1) {
    perror("fcntl F_SETFL, O_NONBLOCK");
    return -1;
  }
  return 0;
}

typedef struct {
  PFNEPOLLCALLBACK callback;
  void *user_data;
  uint32_t epoll_fd;
} EpollData;

static int32_t epoll_fd = epoll_create(20);
const int32_t EPOLL_NUM_EVENTS = 20;

int unreg_listener(int fd) {
  return epoll_ctl(epoll_fd, EPOLL_CTL_DEL, fd, NULL);
}

int reg_listener(int fd, PFNEPOLLCALLBACK listener, void *user_data,
                 int listen_events) {
  EpollData *epd = (EpollData *)malloc(sizeof(EpollData));
  epd->epoll_fd = fd;
  epd->user_data = user_data;
  epd->callback = listener;
  struct epoll_event evt = {};
  evt.events = listen_events;
  evt.data.ptr = epd;
  int err = epoll_ctl(epoll_fd, EPOLL_CTL_ADD, fd, &evt);
  if (err < 0) {
    free(epd);
    return err;
  }
  return 0;
}

#define PROCESSED 0
#define NEEDS_MORE_DATA 1

#define MSG_ERROR 0xFF
#define MSG_ILLEGAL 0xFE
#define MSG_STARTPROCESS 0
#define MSG_STARTPROCESS_RESPONSE 1
#define MSG_FRAME 2
#define MSG_KILLPROCESS 3
#define MSG_KILLPROCESSRESPONSE 4
#define MSG_PIPECLOSED 5
#define MSG_STARTPROCESS_PTY 6
#define MSG_STARTPROCESS_PTY_RESPONSE 7

typedef struct {
  int read_cursor;
  int read_remaining;
  int write_cursor;
  int write_remaining;
  uint8_t *data;
  size_t data_size;
  int self_allocated;
} BufferContext;

int new_buffer_context(BufferContext **buf_ctx, uint8_t *msg, size_t msg_len) {
  auto bx = *buf_ctx = new BufferContext();
  bx->read_cursor = 0;
  bx->read_remaining = msg_len;
  bx->write_cursor = 0;
  bx->write_remaining = msg_len;
  bx->data = msg;
  bx->data_size = msg_len;
  return 0;
}

int new_buffer_context_with_size(BufferContext **buf_ctx, size_t msg_len) {
  uint8_t *msg_buffer = (uint8_t *)malloc(msg_len);
   int ret = new_buffer_context(buf_ctx, msg_buffer, msg_len);
   (*buf_ctx)->self_allocated = 1;
   return ret;
}

int free_buffer_context(BufferContext *buf_ctx, bool free_data = false) {
  if (buf_ctx->self_allocated) {
    free(buf_ctx->data);
  }
  delete buf_ctx;
  return 0;
}

// FIX: read_u8 bounds check was inverted (< should be >)
int read_u8(BufferContext *buf, uint8_t *dat) {
  if (sizeof(uint8_t) > buf->read_remaining) {
    return MSG_ERROR;
  }
  *dat = buf->data[buf->read_cursor];
  buf->read_cursor += 1;
  buf->read_remaining -= 1;
  return 0;
}

#define DEFINE_READER(type, conv, name)                                        \
  int read_##name##_be(BufferContext *buf, type *dat) {                        \
    if (sizeof(type) > buf->read_remaining) {                                  \
      return MSG_ERROR;                                                        \
    }                                                                          \
    *dat = conv(*(type *)&buf->data[buf->read_cursor]);                        \
    buf->read_cursor += sizeof(type);                                          \
    buf->read_remaining -= sizeof(type);                                       \
    return 0;                                                                  \
  };                                                                           \
  int read_##name(BufferContext *buf, type *dat) {                             \
    if (sizeof(type) > buf->read_remaining) {                                  \
      return MSG_ERROR;                                                        \
    }                                                                          \
    *dat = *(type *)&buf->data[buf->read_cursor];                              \
    buf->read_cursor += sizeof(type);                                          \
    buf->read_remaining -= sizeof(type);                                       \
    return 0;                                                                  \
  };

// FIX: DEFINE_WRITER had inverted bounds checks (< should be >),
// used read_cursor instead of write_cursor, and hardcoded be32toh
// instead of using the conv parameter
#define DEFINE_WRITER(type, conv, name)                                        \
  int write_##name##_be(BufferContext *buf, type dat) {                        \
    if (sizeof(type) > buf->write_remaining) {                                 \
      return MSG_ERROR;                                                        \
    };                                                                         \
    *(type *)(&buf->data[buf->write_cursor]) = conv(dat);                      \
    buf->write_remaining -= sizeof(type);                                      \
    buf->write_cursor += sizeof(type);                                         \
    return 0;                                                                  \
  }                                                                            \
  int write_##name(BufferContext *buf, type dat) {                             \
    if (sizeof(type) > buf->write_remaining) {                                 \
      return MSG_ERROR;                                                        \
    };                                                                         \
    *(type *)(&buf->data[buf->write_cursor]) = dat;                            \
    buf->write_remaining -= sizeof(type);                                      \
    buf->write_cursor += sizeof(type);                                         \
    return 0;                                                                  \
  }

DEFINE_READER(uint16_t, be16toh, u16);
DEFINE_READER(uint32_t, be32toh, u32);
DEFINE_READER(uint64_t, be64toh, u64);

DEFINE_WRITER(uint16_t, htobe16, u16);
DEFINE_WRITER(uint32_t, htobe32, u32);
DEFINE_WRITER(uint64_t, htobe64, u64);

int write_raw_array(BufferContext *buf, uint8_t *in_buffer,
                    size_t in_buffer_len) {
  if (buf->write_remaining < in_buffer_len) {
    return MSG_ERROR;
  }
  memcpy(buf->data + buf->write_cursor, in_buffer, in_buffer_len);
  buf->write_cursor += in_buffer_len;
  buf->write_remaining -= in_buffer_len;
  return 0;
};

#define CHECK_OP(val)                                                          \
  do {                                                                         \
    int ret = val;                                                             \
    if (ret != 0) {                                                            \
      return ret;                                                              \
    }                                                                          \
  } while (0)

int read_string(BufferContext *buf, std::string *data) {
  uint16_t string_len = 0;
  CHECK_OP(read_u16_be(buf, &string_len));
  if (string_len > buf->read_remaining) {
    return MSG_ERROR;
  }
  data->append(buf->data + buf->read_cursor,
               buf->data + buf->read_cursor + string_len);
  buf->read_cursor += string_len;
  buf->read_remaining -= string_len;
  return 0;
}

int is_fid_in_use(ConnectionState *conn_state, int fid) {
  auto &m = *conn_state->fid_to_fd;
  auto it = m.find(fid);
  if (it != m.end()) {
    return 1;
  }
  return 0;
}

// FIX: destroy_fd_state had inverted logic — returned early when found,
// tried to erase when not found
int destroy_fd_state(FDState *pstate) {
  int fid = pstate->self_fid;
  ConnectionState *c = (ConnectionState *)pstate->conn_state;
  auto it = (c->fid_to_fd)->find(fid);
  if (it == c->fid_to_fd->end()) {
    // not found, nothing to do
    return 0;
  }
  unreg_listener(pstate->self_fd);

  close(pstate->self_fd);
  c->fid_to_fd->erase(it);
  delete pstate;

  return 0;
}

int fid_fd_epoll_handler(int epoll_fd, int epoll_evts, void *user_data) {
  FDState *proc = (FDState *)user_data;
  ConnectionState *conn_state = (ConnectionState *)proc->conn_state;
  std::vector<uint8_t> full_buffer;
  char buf[255];
  if (!proc->is_readable) {
    uint32_t pipe_to_send = htobe32(proc->self_fid);
    conn_state->data_bytes.clear();
    conn_state->data_bytes.assign((uint8_t *)&pipe_to_send,
                                  (uint8_t *)&pipe_to_send + sizeof(uint32_t));

    conn_state->send_data_bytes(conn_state, 0, MSG_PIPECLOSED);
    unreg_listener(epoll_fd);
    return 0;
  }
  while (true) {
    int ret = read(epoll_fd, buf, sizeof(buf));
    if (ret < 0 && errno == EWOULDBLOCK) {
      break;
    }

    if (ret < 0) {
      if (errno == EBADF || (errno == EIO && proc->is_pty)) {
        uint32_t pipe_to_send = htobe32(proc->self_fid);

        conn_state->data_bytes.clear();
        conn_state->data_bytes.assign((uint8_t *)&pipe_to_send,
                                      (uint8_t *)&pipe_to_send +
                                          sizeof(uint32_t));
        conn_state->send_data_bytes(conn_state, 0, MSG_PIPECLOSED);
        unreg_listener(epoll_fd);
        break;
      }
     
      perror("s");
      return -1;
    }
    if (ret == 0) {
      unreg_listener(epoll_fd);
      conn_state->data_bytes.clear();
      uint32_t fdat = proc->self_pid;
      uint32_t pipe_to_send = htobe32(proc->self_fid);

      conn_state->data_bytes.clear();
      conn_state->data_bytes.assign((uint8_t *)&pipe_to_send,
                                    (uint8_t *)&pipe_to_send +
                                        sizeof(uint32_t));
      conn_state->send_data_bytes(conn_state, 0, MSG_PIPECLOSED);
      return 0;
    }
    full_buffer.insert(full_buffer.end(), buf, buf + ret);
  }
  // TODO: forward full_buffer as a MSG_FRAME back to the client
  BufferContext *bctx;
  new_buffer_context_with_size(&bctx, full_buffer.size() + sizeof(uint32_t));
  write_u32_be(bctx, proc->self_fid);
  write_raw_array(bctx, full_buffer.data(), full_buffer.size());
  conn_state->data_bytes.clear();
  conn_state->data_bytes.insert(conn_state->data_bytes.end(), bctx->data,
                                bctx->data + bctx->data_size);
  conn_state->send_data_bytes(conn_state, 0, MSG_FRAME);

  return 0;
}

int add_fd(ConnectionState *conn_state, int fid, int fd, int pid,
           int is_readable, int real_pid, int is_pty) {
  set_nonblock(fd);
  FDState *proc_state = new FDState();
  proc_state->conn_state = conn_state;
  proc_state->self_fid = fid;
  proc_state->self_pid = pid;
  proc_state->is_readable = is_readable;
  proc_state->self_fd = fd;
  proc_state->is_pty = is_pty;
  proc_state->self_real_pid = real_pid;
  (*conn_state->fid_to_fd)[fid] = proc_state;
  if (pid > -1) {

    pids_to_fdstates[real_pid].insert(proc_state);
  }
  if (is_readable)
    reg_listener(fd, fid_fd_epoll_handler, proc_state, EPOLLIN);
  else
    reg_listener(fd, fid_fd_epoll_handler, proc_state, EPOLLERR);

  return 0;
}

int handle_frame(ConnectionState *conn_state, int message_id, uint8_t *msg,
                 size_t msg_len) {
  BufferContext *buf = NULL;
  new_buffer_context(&buf, msg, msg_len);
  uint32_t fid = 0;
  CHECK_OP(read_u32_be(buf, &fid));
  uint8_t *dat = buf->data + buf->read_cursor;

  if (conn_state->fid_to_fd->find(fid) == conn_state->fid_to_fd->end()) {
    free_buffer_context(buf);
    return MSG_ERROR;
  }

  int sfd = (*conn_state->fid_to_fd)[fid]->self_fd;
  write(sfd, dat, buf->read_remaining);
  free_buffer_context(buf);
  return 0;
}

int handle_start_process(ConnectionState *conn_state, int message_id,
                         uint8_t *msg, size_t msg_len) {

  BufferContext *buf = NULL;
  new_buffer_context(&buf, msg, msg_len);
  std::string process_name;
  CHECK_OP(read_string(buf, &process_name));
  uint32_t num_args = 0;
  CHECK_OP(read_u32_be(buf, &num_args));

  // FIX: store strings persistently so c_str() pointers remain valid,
  // and don't pre-size the vector (which added null entries)
  std::vector<std::string> arg_strings;
  arg_strings.reserve(num_args);
  for (uint32_t i = 0; i < num_args; i++) {
    std::string ar;
    CHECK_OP(read_string(buf, &ar));
    arg_strings.push_back(std::move(ar));
  }

  // Build the char* array for execv: [process_name, args..., NULL]
  std::vector<char *> argv_ptrs;
  argv_ptrs.push_back(const_cast<char *>(process_name.c_str()));
  for (auto &s : arg_strings) {
    argv_ptrs.push_back(const_cast<char *>(s.c_str()));
  }
  argv_ptrs.push_back(nullptr);

  uint32_t stdin_fid = 0;
  CHECK_OP(read_u32_be(buf, &stdin_fid));
  if (is_fid_in_use(conn_state, stdin_fid)) {
    printf("FID IN USE\n");
    free_buffer_context(buf);
    return MSG_ERROR;
  }

  uint32_t stderr_fid = 0;
  CHECK_OP(read_u32_be(buf, &stderr_fid));
  if (is_fid_in_use(conn_state, stderr_fid)) {
    printf("FID IN USE\n");
    free_buffer_context(buf);
    return MSG_ERROR;
  }

  uint32_t stdout_fid = 0;
  CHECK_OP(read_u32_be(buf, &stdout_fid));
  if (is_fid_in_use(conn_state, stdout_fid)) {
    printf("FID IN USE\n");
    free_buffer_context(buf);
    return MSG_ERROR;
  }

  uint32_t process_fid = 0;
  CHECK_OP(read_u32_be(buf, &process_fid));
  if (is_fid_in_use(conn_state, process_fid)) {
    printf("PROCESS FID IN USE\n");
    free_buffer_context(buf);
    return MSG_ERROR;
  }

  free_buffer_context(buf);

  int proc_stdin[2] = {};
  int proc_stdout[2] = {};
  int proc_stderr[2] = {};

  if (pipe2(proc_stdin, O_CLOEXEC) < 0) {
    perror("pipe() for process failed: ");
    return MSG_ERROR;
  }
  if (pipe2(proc_stderr, O_CLOEXEC) < 0) {
    perror("pipe() for process failed: ");
    close(proc_stdin[0]);
    close(proc_stdin[1]);
    return MSG_ERROR;
  }
  if (pipe2(proc_stdout, O_CLOEXEC) < 0) {
    perror("pipe() for process failed: ");
    close(proc_stdin[0]);
    close(proc_stdin[1]);
    close(proc_stderr[0]);
    close(proc_stderr[1]);
    return MSG_ERROR;
  }

  int pid = fork();
  if (pid == 0) {

    // dup2 clears CLOEXEC on the new fd, so stdin/stdout/stderr survive exec.
    // All other pipe fds have CLOEXEC set and will be closed at exec.
    dup2(proc_stdin[0], 0);
    dup2(proc_stdout[1], 1);
    dup2(proc_stderr[1], 2);
    setsid();
    execv(process_name.c_str(), argv_ptrs.data());
    perror("Failed to launch process");

    _exit(1);
  } else if (pid < 0) {
    perror("fork() failed");
    close(proc_stdin[0]);
    close(proc_stdin[1]);
    close(proc_stdout[0]);
    close(proc_stdout[1]);
    close(proc_stderr[0]);
    close(proc_stderr[1]);
    return MSG_ERROR;
  } else {
    // Close child ends of pipes in parent
    close(proc_stdin[0]);
    close(proc_stdout[1]);
    close(proc_stderr[1]);

    add_fd(conn_state, stdin_fid, proc_stdin[1], process_fid, false, pid, false);
    add_fd(conn_state, stdout_fid, proc_stdout[0], process_fid, true, pid, false);
    add_fd(conn_state, stderr_fid, proc_stderr[0], process_fid, true, pid, false);
    conn_state->pfid_to_pid->insert(std::make_pair(process_fid, pid));
  }

  conn_state->data_bytes.clear();
  BufferContext *response_buffer = NULL;
  new_buffer_context_with_size(&response_buffer, sizeof(uint32_t));
  CHECK_OP(write_u32_be(response_buffer, 0));
  conn_state->data_bytes.insert(
      conn_state->data_bytes.end(), response_buffer->data,
      response_buffer->data + response_buffer->data_size);
  conn_state->send_data_bytes(conn_state, message_id,
                              MSG_STARTPROCESS_RESPONSE);
  free_buffer_context(response_buffer, true);

  return 0;
}
int handle_start_proc_pty(ConnectionState *conn_state, int message_id,
                        uint8_t *msg, size_t message_len) {
  BufferContext *buf = NULL;
  new_buffer_context(&buf, msg, message_len);
  std::string process_name;
  CHECK_OP(read_string(buf, &process_name));
  uint32_t num_args = 0;
  CHECK_OP(read_u32_be(buf, &num_args));

  // FIX: store strings persistently so c_str() pointers remain valid,
  // and don't pre-size the vector (which added null entries)
  std::vector<std::string> arg_strings;
  arg_strings.reserve(num_args);
  for (uint32_t i = 0; i < num_args; i++) {
    std::string ar;
    CHECK_OP(read_string(buf, &ar));
    arg_strings.push_back(std::move(ar));
  }

  // Build the char* array for execv: [process_name, args..., NULL]
  std::vector<char *> argv_ptrs;
  argv_ptrs.push_back(const_cast<char *>(process_name.c_str()));
  for (auto &s : arg_strings) {
    argv_ptrs.push_back(const_cast<char *>(s.c_str()));
  }
  argv_ptrs.push_back(nullptr);
  
  uint32_t pty_fid;
  CHECK_OP(read_u32_be(buf, &pty_fid));
  if (is_fid_in_use(conn_state, pty_fid)) {
    return MSG_ERROR;
  };
  uint32_t proc_fid;
  CHECK_OP(read_u32_be(buf, &proc_fid));
  if (is_fid_in_use(conn_state, proc_fid)) {
    return MSG_ERROR;
  };

  int pty_fd;
  int chld = forkpty(&pty_fd, NULL, NULL, NULL);
  if (chld == 0) {
    // in children of pty.
    setsid();
    execvp(process_name.c_str(), (char*const*)argv_ptrs.data());
    perror("execlp");
    _exit(1);
  }else {
    add_fd(conn_state, pty_fid, pty_fd, proc_fid, 1, chld, true);
    conn_state->pfid_to_pid->insert(std::make_pair(proc_fid, chld));
  }
  CHECK_OP(free_buffer_context(buf));

  conn_state->data_bytes.clear();
  conn_state->data_bytes.resize(0);
  conn_state->send_data_bytes(conn_state, message_id, MSG_STARTPROCESS_PTY_RESPONSE);
return 0;
}
int close_pipe(ConnectionState* conn_state, int message_id, uint8_t* msg, size_t message_len) {
  BufferContext* buf = NULL;
  CHECK_OP(new_buffer_context(&buf, msg, message_len));
  uint32_t fid = 0;
  CHECK_OP(read_u32_be(buf, &fid));
  if (!is_fid_in_use(conn_state, fid)) {
    printf("CLosing non-existnt FD\n");
    return MSG_ERROR;
  }
  auto it = conn_state->fid_to_fd->find(fid);
  if (it == conn_state->fid_to_fd->end()) {
    return MSG_ERROR;
  }
  FDState* fds = it->second;
  auto a = pids_to_fdstates.find(fds->self_real_pid);
  if (a == pids_to_fdstates.end()) {
    return MSG_ERROR;
  }
  auto fdsa = a->second.find(fds);
  if (fdsa == a->second.end()) {
    return MSG_ERROR;
  }
  a->second.erase(fdsa);
  destroy_fd_state(fds);

  return 0;
};
int handle_kill_process(ConnectionState *conn_state, int message_id,
                        uint8_t *msg, size_t message_len) {

  BufferContext* buf = NULL;
  CHECK_OP(new_buffer_context(&buf, msg, message_len));
  uint32_t process_fid;
  CHECK_OP(read_u32_be(buf, &process_fid));
  auto it = conn_state->pfid_to_pid->find(process_fid);
  if (it == conn_state->pfid_to_pid->end()) {
    return MSG_ERROR;
  }
  int32_t pid = it->second;
  killpg(pid, SIGKILL);
  int proc_stat = 0;
  waitpid(-1, &proc_stat, WNOHANG);
  free_buffer_context(buf);
  conn_state->pfid_to_pid->erase(it);
  conn_state->data_bytes.clear();
  conn_state->data_bytes.resize(sizeof(uint32_t));
  
  CHECK_OP(new_buffer_context(&buf, conn_state->data_bytes.data(), conn_state->data_bytes.size()));
  CHECK_OP(write_u32_be(buf, proc_stat));
  conn_state->send_data_bytes(conn_state, message_id, MSG_KILLPROCESSRESPONSE);
  // the fds erase themselves
  return 0;
};
int read_full_message(ConnectionState *conn_state, uint8_t **response_bytes,
                      size_t *response_len) {

  if (conn_state->data_bytes.size() < sizeof(Message)) {
    return NEEDS_MORE_DATA;
  }

  Message *msg = reinterpret_cast<Message *>(conn_state->data_bytes.data());
  size_t msg_len = be32toh(msg->message_len);
  if (msg_len > conn_state->data_bytes.size()) {
    return NEEDS_MORE_DATA;
  }

  uint32_t msg_id = be32toh(msg->message_id);
  uint8_t method = msg->method;
  PFNHANDLEMESSAGE handler = NULL;

  switch (method) {
  case MSG_ERROR:
    return MSG_ERROR;
  case MSG_ILLEGAL:
    return MSG_ERROR;
  case MSG_STARTPROCESS:
    handler = handle_start_process;
    break;
  case MSG_FRAME:
    handler = handle_frame;
    break;
  case MSG_KILLPROCESS:
    handler = handle_kill_process;
    break;
  case MSG_STARTPROCESS_PTY:
    handler = handle_start_proc_pty;
    break;
  case MSG_PIPECLOSED:
    handler = close_pipe;
    break;
  }

  // Consume the message from the buffer before calling the handler,
  // since the handler may modify data_bytes for its response
  size_t payload_offset = offsetof(Message, method_payload);
  size_t payload_len = msg_len - payload_offset;

  // Copy the payload out since we're about to modify data_bytes
  std::vector<uint8_t> payload_copy(conn_state->data_bytes.begin() +
                                        payload_offset,
                                    conn_state->data_bytes.begin() + msg_len);

  conn_state->data_bytes = std::vector<uint8_t>(
      conn_state->data_bytes.begin() + msg_len, conn_state->data_bytes.end());

  if (handler != NULL) {
    int ret = handler(conn_state, msg_id, payload_copy.data(), payload_len);
    if (ret != 0) {
      return ret;
    }
  } else {
    return MSG_ERROR;
  }
  return 0;
}

int fd_tcp_handler(int epoll_fd, int epoll_evts, void *user_data) {
  ConnectionState *conn_state = (ConnectionState *)user_data;
  uint8_t buf[255];
  bool is_connection_closed = false;

  if ((epoll_evts & EPOLLIN) == EPOLLIN) {
    while (true) {
      ssize_t v = recv(epoll_fd, buf, sizeof(buf), 0);
      if (v == -1) {
        if (errno == EWOULDBLOCK || errno == EAGAIN) {
          // FIX: break instead of return so we fall through to message
          // processing
          break;
        } else {
          return 1;
        }
      }
      if (v > 0) {
        conn_state->data_bytes.insert(conn_state->data_bytes.end(), buf,
                                      buf + v);
      }
      if (v == 0) {
        shutdown(epoll_fd, SHUT_RDWR);
        is_connection_closed = true;
        break;
      }
    }
  }

  uint8_t *response_bytes = NULL;
  size_t response_len = 0;

  while (true) {
    int m = read_full_message(conn_state, &response_bytes, &response_len);
    if (m == MSG_ERROR) {
      return 0;
    }
    if (m == NEEDS_MORE_DATA) {
      break;
    }
  }

  if (is_connection_closed) {
    unreg_listener(epoll_fd);
    // Make a copy of the map since destroy_fd_state modifies it
    int stat;
    for (auto  ca : *conn_state->pfid_to_pid) {
      killpg(ca.second, SIGKILL);
      waitpid(-1, &stat, WNOHANG);
      auto it = pids_to_fdstates.find(ca.second);
      if (it != pids_to_fdstates.end()) {
        pids_to_fdstates.erase(it);
      }
    }
    auto fid_map_copy = *conn_state->fid_to_fd;
    for (auto const &[fid, fdstate] : fid_map_copy) {
      destroy_fd_state(fdstate);
    }
    
    delete conn_state;
    return 0;
  }
  return 0;
}

int fd_tcp_listener_handler(int epoll_fd, int epoll_evts, void *user_data) {
  struct sockaddr_in ad;
  socklen_t addr_len = sizeof(struct sockaddr_in);
  while (true) {
    addr_len = sizeof(ad);
    int a = accept4(epoll_fd, (struct sockaddr *)&ad, &addr_len,
                    SOCK_CLOEXEC | SOCK_NONBLOCK);
    int one = 1;
    if (setsockopt(a, SOL_TCP, TCP_NODELAY, &one, sizeof(one)) < 0) {
      return 1;
    };

    if (a == -1) {
      if (errno == EAGAIN || errno == EWOULDBLOCK) {
        return 0;
      }
      perror("accept");
      return 1;
    }
    ConnectionState *cs = new ConnectionState();
    cs->data_bytes = std::vector<uint8_t>();
    cs->self_fd = a;
    cs->send_data_bytes = tcp_send_connection_state;
    cs->fid_to_fd = std::make_unique<std::map<int32_t, FDState *>>();
    cs->pfid_to_pid = std::make_unique<std::map<int32_t, int32_t>>();

    reg_listener(a, fd_tcp_handler, cs, EPOLLIN);
  }
  return 0;
}

static void sigchld_handler(int sig) {
  int status;
  pid_t killed_pid;
  while ((killed_pid = waitpid(-1, &status, WNOHANG)) > 0) {
    auto it = pids_to_fdstates.find(killed_pid);

    if (it != pids_to_fdstates.end()) {
      auto the_set = it->second;
      for (auto a : the_set) {
        ConnectionState *s = (ConnectionState *)a->conn_state;
        s->data_bytes.clear();
        uint32_t pfid = be32toh(a->self_pid);
        uint32_t exit_code = htobe32((WEXITSTATUS(status)));
        uint32_t ca[] = {pfid, exit_code};
        s->data_bytes.resize(sizeof(ca));
        memcpy(s->data_bytes.data(), ca, sizeof(ca));
        s->send_data_bytes(s, 0, MSG_KILLPROCESSRESPONSE);
        break;
      }
      pids_to_fdstates.erase(it);
    }
  }
}
static int hvc_handler(int epoll_fd, int epoll_evts, void* user_data) {
 ConnectionState *conn_state = (ConnectionState *)user_data;
  uint8_t buf[255];
  bool is_connection_closed = false;

  if ((epoll_evts & EPOLLIN) == EPOLLIN) {
    while (true) {
      ssize_t v = read(epoll_fd, buf, sizeof(buf));
      if (v == -1) {
        if (errno == EWOULDBLOCK || errno == EAGAIN) {
          // FIX: break instead of return so we fall through to message
          // processing
          break;
        } else {
          return 1;
        }
      }
      if (v > 0) {
        conn_state->data_bytes.insert(conn_state->data_bytes.end(), buf,
                                      buf + v);
      }
      if (v == 0) {
        shutdown(epoll_fd, SHUT_RDWR);
        is_connection_closed = true;
        break;
      }
    }
  }

  uint8_t *response_bytes = NULL;
  size_t response_len = 0;

  while (true) {
    int m = read_full_message(conn_state, &response_bytes, &response_len);
    if (m == MSG_ERROR) {
      return 0;
    }
    if (m == NEEDS_MORE_DATA) {
      break;
    }
  }

  if (is_connection_closed) {
    unreg_listener(epoll_fd);
    // Make a copy of the map since destroy_fd_state modifies it
    int stat;
    for (auto  ca : *conn_state->pfid_to_pid) {
      killpg(ca.second, SIGKILL);
      waitpid(-1, &stat, WNOHANG);
      auto it = pids_to_fdstates.find(ca.second);
      if (it != pids_to_fdstates.end()) {
        pids_to_fdstates.erase(it);
      }
    }
    auto fid_map_copy = *conn_state->fid_to_fd;
    for (auto const &[fid, fdstate] : fid_map_copy) {
      destroy_fd_state(fdstate);
    }
    
    delete conn_state;
    return 0;
  }
  return 0;
}
#define IS_HVC
int main(int argc, char **argv) {
  int err = 0;

  struct epoll_event *poll_evts = (struct epoll_event *)malloc(
      sizeof(struct epoll_event) * EPOLL_NUM_EVENTS);
#if not defined(IS_HVC)
  int tcp_listener_fd = socket(AF_INET, SOCK_STREAM | SOCK_CLOEXEC, 0);
  if (tcp_listener_fd == -1) {
    perror("TCP Listener fd not created.");
    return 1;
  }
  int so_reuse = 1;
  err = setsockopt(tcp_listener_fd, SOL_SOCKET, SO_REUSEADDR, &so_reuse,
                   sizeof(so_reuse));
  if (err == -1) {
    perror("setsockopt(SO_REUSEADDR) failed.");
    return 1;
  }

  err = setsockopt(tcp_listener_fd, SOL_SOCKET, SO_REUSEPORT, &so_reuse,
                   sizeof(so_reuse));
  if (err == -1) {
    perror("setsockopt(SO_REUSEADDR) failed.");
    return 1;
  }

  struct sockaddr_in sa = {};
  memset(&sa, 0, sizeof(sockaddr_in));
  inet_aton("127.0.0.1", &sa.sin_addr);
  sa.sin_port = htons(8040);
  sa.sin_family = AF_INET;

  err =
      bind(tcp_listener_fd, (const struct sockaddr *)&sa, sizeof(sockaddr_in));
  if (err == -1) {
    perror("Bind error: ");
    return 1;
  }
  err = setsockopt(tcp_listener_fd, SOL_TCP, TCP_NODELAY, &so_reuse,
                   sizeof(so_reuse));
  if (err == -1) {
    perror("setsockopt(TCP_NODELAY) failed.");
    return 1;
  }
  err = listen(tcp_listener_fd, 3);
  if (err == -1) {
    perror("Listen() error");
    return 1;
  }
  set_nonblock(tcp_listener_fd);
  reg_listener(tcp_listener_fd, fd_tcp_listener_handler, NULL, EPOLLIN);
#else 

  int hvcFd = open("/dev/hvc0", O_NONBLOCK|O_NOCTTY|O_RDWR);
  if (hvcFd < 0 ) {
    perror("open(/dev/hvc0)");
    return 1;
  }
  struct termios settings;
  if (tcgetattr(hvcFd, &settings) < 0) {
    perror("tcgetattr");
    return 1;
  };
  
  cfmakeraw(&settings);
  if (tcsetattr(hvcFd, TCSANOW, &settings) < 0) {
    perror("tcsetattr");
    return 1;
  };
  set_nonblock(hvcFd);
  ConnectionState *cs = new ConnectionState();
    cs->data_bytes = std::vector<uint8_t>();
    cs->self_fd = hvcFd;
    cs->send_data_bytes = hvc_send_state;
    cs->fid_to_fd = std::make_unique<std::map<int32_t, FDState *>>();
    cs->pfid_to_pid = std::make_unique<std::map<int32_t, int32_t>>();
  
  reg_listener(hvcFd, hvc_handler, cs, EPOLLIN);
  // uint8_t test = 1;
  // write(hvcFd, &test, sizeof(test));
  
#endif
  struct sigaction c = {};
  c.sa_handler = sigchld_handler;
  sigemptyset(&c.sa_mask);
  c.sa_flags = SA_RESTART | SA_NOCLDSTOP;
  sigaction(SIGCHLD, &c, NULL);
  signal(SIGPIPE, SIG_IGN);

  printf("Server started on localhost:8088\n");
  while (true) {
    int num_events = epoll_wait(epoll_fd, poll_evts, EPOLL_NUM_EVENTS, -1);
    if (num_events < 0) {
      if (errno == EINTR) {
        continue;
      }
      perror("epoll_wait");
      return 1;
    }
    for (int i = 0; i < num_events; i++) {
      struct epoll_event *v = &poll_evts[i];
      auto cb_data = (EpollData *)v->data.ptr;
      int ret =
          cb_data->callback(cb_data->epoll_fd, v->events, cb_data->user_data);
      if (ret < 0) {
        return 1;
      }
    }
  }
}