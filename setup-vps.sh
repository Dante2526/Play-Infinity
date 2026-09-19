#!/bin/bash
echo "Configuring firewall..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save

echo "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "Installing PM2 and dependencies..."
sudo npm install -g pm2
cd /home/ubuntu
npm install

echo "Starting Proxy..."
sudo pm2 start proxy.mjs --name video-proxy
sudo pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root

echo "Proxy setup complete!"
