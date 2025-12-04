# ប្រើ Node image ដែលមាន Build Tools សំខាន់ៗ
FROM node:20-bullseye

# កំណត់ Working Directory
WORKDIR /usr/src/app

# ដំឡើង Dependencies របស់ប្រព័ន្ធសម្រាប់ Module Canvas
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pango-view

# Copy package.json និង package-lock.json
COPY package*.json ./

# ដំឡើង npm dependencies
RUN npm install

# Copy source code ទាំងអស់
COPY . .

# កំណត់ Port សម្រាប់ App
ENV PORT 3000
EXPOSE 3000

# ចាប់ផ្តើម Application
CMD [ "npm", "start" ]
