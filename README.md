# Node.js Reverse Proxy (Nginx Clone)

A high-performance, multi-core reverse proxy built entirely in Node.js. It routes incoming HTTP traffic to backend upstream servers using dynamic, metric-based load balancing and centralized rate limiting.

---

## 1. What is a Reverse Proxy?

A **Reverse Proxy** is a server that sits in front of backend web servers (called "upstreams") and intercepts client requests (e.g., from a web browser). Instead of the client talking directly to the backend database or application, the client talks to the reverse proxy, which then safely forwards the request to the best available backend server. 

![Reverse Proxy](./images/reverse_proxy_flow.png)

### Core Components
* **Master Process:** The primary entry point. It binds to the exposed port, accepts raw TCP connections, and spawns the sub-processes.
* **Worker Processes:** The heavy lifters. They receive delegated TCP sockets from the Master, parse the HTTP requests, execute rate-limit checks, select the best upstream server, and stream the data.
* **Memory Server:** A dedicated background process acting as the "Control Plane." It maintains the global state for IP rate-limits and upstream metrics (like latency and active connections) so all Workers can synchronize data seamlessly.
* **Upstream Servers:** Your actual backend application servers that process the final requests.

---

## 2. Architecture

![](./images/architecture.png)

---

## 3. Features

* **ETC Load Balancing:** Dynamically routes traffic using an "Estimated Time to Completion" algorithm. It scores upstreams based on their active connections and real-time average latency.
* **Method-Aware Routing:** The load balancer independently tracks performance metrics for different HTTP methods (e.g., `GET` vs `POST`), ensuring heavy operations are naturally routed to less-burdened servers.
* **Token-Bucket Rate Limiting:** Enforces strict IP-based rate limiting. The state is centrally managed by the Memory Server, ensuring users can't bypass limits by hitting different worker threads.
* **Multi-Core Concurrency:** Leverages the `node:cluster` module. The Master process delegates raw TCP sockets to Workers in a round-robin fashion, allowing the proxy to utilize 100% of the host CPU.
* **Stream Piping:** Streams HTTP bodies directly from the client to the upstream (and vice versa) without buffering massive files in RAM.

---

## 4. How to Run

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Upstreams**
   Edit `config.yaml` to define your routing rules and backend upstream URLs.

3. **Compile and Run**
   ```bash
   # Compile TypeScript to JavaScript
   npx tsc
   
   # Start the Reverse Proxy Cluster
   node dist/index.js
   ```

---

## 5. Testing

You can easily test the load balancer locally using the included test server:

1. **Start the Upstream Servers**
   In a separate terminal window, launch the mock upstream servers. This script spins up multiple dummy servers on different ports:
   ```bash
   node tests/test-server.js
   ```

2. **Send Traffic**
   Once both the reverse proxy and test servers are running, use `curl` to hit the proxy (assuming your config maps to port 8080):
   ```bash
   curl http://localhost:8080/
   ```
   *Run this command multiple times to see the dynamic load balancer automatically route your requests to different upstream servers based on their latency and active connection counts!*
