#include <fcntl.h>
#include <glib.h>
#include <memory.h>
#include <stdint.h>
#include <stdio.h>
#include <termios.h>
#include <unistd.h>

static GHashTable *ght;
typedef struct {
  int pid;
  int stdinFd;
  int stdoutFd;

} Connection;

// define protocol methods
#define PROTOCOL_CONNECT 0
#define PROTOCOL_PKTFRAME 1
#define PROTOCOL_DISCONNECT 2
#define PROTOCOL_ERROR 3

// define protocol errors
#define PROTOCOL_CONNECTION_UNKNOWN_ERROR 1
#define PROTOCOL_CONNECTION_ALREADY_EXISTS 2
#define PROTOCOL_CONNECTION_DOES_NOT_EXIST 3

typedef struct {
  uint32_t connId;
  uint8_t pktType;
  uint16_t pktLen;
  void *pktData;
} MultiplexerProtocol;
typedef struct {
  int err;
} ProtocolError;
typedef struct {
  int stringLen;
  char str[];
} ProtocolString;
typedef void (*PacketHandler)(uint32_t connId, size_t len, uint8_t *pktData,
                              uint8_t **response, uint8_t *pktType);

typedef struct {
  uint16_t programPathLen;
  uint16_t argumentsLen;
  uint8_t vardata[];
} ConnectRequest;
#define RET_ERROR(ERR)                                                         \
  do {                                                                         \
    *pktType = PROTOCOL_ERROR;                                                 \
    *response = malloc(sizeof(ProtocolError));                                 \
    ProtocolError *perr = (ProtocolError *)(*response);                        \
    perr->err = ERR;                                                           \
  } while (0);
#define DEFINE_HANDLER(funcName)                                               \
  int handle_##funcName(uint32_t connId, size_t len, uint8_t *pktData,         \
                        uint8_t **response, uint8_t *pktType)

/**
Handle connect requests. They contain a program path, and arguments to send to
the program.
*/
DEFINE_HANDLER(connect) {
  gpointer entry = g_hash_table_lookup(ght, GINT_TO_POINTER(connId));
  if (entry) {
    RET_ERROR(PROTOCOL_CONNECTION_UNKNOWN_ERROR);
    return 0;
  }
  ConnectRequest *connReq = (ConnectRequest *)pktData;
  size_t progPathLen = connReq->programPathLen;
  char *program_path = malloc(progPathLen * sizeof(char));
  int restLen = len - sizeof(ConnectRequest);
  if (restLen < progPathLen) {
    free(program_path);
    RET_ERROR(PROTOCOL_CONNECTION_UNKNOWN_ERROR);
    return 0;
  }

  uint8_t *varData = connReq->vardata;

  memcpy(program_path, varData, progPathLen);
  restLen -= progPathLen;
  varData += progPathLen;
  // check for arguments
  int processedArguments = 0;
  char **allArguments = malloc((connReq->argumentsLen + 1) * sizeof(char*));
  while (restLen >= 0) {
    ProtocolString *pstr = (ProtocolString *)varData;
    int16_t strLen = pstr->stringLen;
    char *dmdat = malloc(strLen + 1);
    memset(dmdat, 0, strLen+1);
    memcpy(dmdat, pstr->str, strLen);
    // dmdat[strLen] = '\0'; redundant
    allArguments[processedArguments ++] = dmdat;
    int advance = sizeof(ProtocolString) + strLen;;
    restLen -= advance;
    varData += advance;
  };
  allArguments[processedArguments] = NULL;
  // got all the var data.
  Connection* conn = (Connection*)malloc(sizeof(Connection));
  
  int pid = fork();
  

  if (pid == 0) {
    // child process
    execvp(program_path, allArguments);
  }else {

  }


  for (int i = 0; i < connReq->argumentsLen; i++) {
    free(allArguments[i]);
  }
  free(allArguments);
  free(program_path);

};

int main(int argc, char **argv) {
  ght = g_hash_table_new(g_direct_hash, g_direct_equal);

  int fd = open("/dev/hvc0", O_RDWR);

  if (fd < 0) {
    perror("Could not open(\"/dev/hvc\")");
    return 1;
  }
  struct termios tty;
  memset(&tty, 0, sizeof(tty));
  int err = tcgetattr(fd, &tty);
  if (err < 0) {
    perror("Could not get the terminal attributes");
    return 1;
  }
  cfmakeraw(&tty);
  err = tcsetattr(fd, TCSANOW, &tty);
  if (err < 0) {
    perror("Could not set the terminal descriptor");
    return 1;
  }
  const char** error = NULL;
  char buf[1];
  uint32_t bufferSize;
  
  if (error) {
    printf("%s\n", *error);
    return 1;
  }
  close(fd);
  return 0;
}