# Stage 1: Build binary
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
COPY go.sum* ./
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/server/main.go

# Stage 2: Minimal runtime image
FROM alpine:latest
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/main .
COPY --from=builder /app/data ./data
ENV PORT=8080
# The local JSON mirror is written under DATA_PATH. On Railway mount a volume
# here so unsent answers survive a redeploy.
ENV DATA_PATH=./data
EXPOSE 8080
CMD ["./main"]
