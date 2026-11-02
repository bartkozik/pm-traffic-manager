import * as Y from 'yjs';

export class NodeExtractor {
  constructor(versionManager) {
    this.versionManager = versionManager;
  }

  // Extract all nodes from a document's latest version
  async extractNodes(roomname) {
    try {
      // Get document versions (separate call)
      const versionsResult = await this.versionManager.getVersions(roomname, { limit: 1 });
      
      if (!versionsResult.versions || versionsResult.versions.length === 0) {
        return [];
      }

      // Get latest version data
      const latestVersion = versionsResult.versions[0];
      const versionData = await this.versionManager.getVersionData(roomname, latestVersion.timestamp);
      
      // Parse Y.js document
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, versionData);
      
      const nodes = [];
      
      // Get the nodes map (this is how the graph store structures data)
      const yNodes = ydoc.getMap('nodes');
      
      if (yNodes && yNodes.size > 0) {
        yNodes.forEach((node, nodeId) => {
          if (node && typeof node === 'object') {
            nodes.push({
              id: node.id || nodeId,
              type: node.type || 'unknown',
              data: {
                label: node.data?.label || node.label || nodeId
              }
            });
          }
        });
      }
      
      return nodes;
    } catch (error) {
      throw new Error(`Failed to extract nodes: ${error.message}`);
    }
  }

  // Extract content from a specific node
  async extractNodeContent(roomname, nodeId) {
    try {
      // Get document versions (separate call)
      const versionsResult = await this.versionManager.getVersions(roomname, { limit: 1 });
      
      if (!versionsResult.versions || versionsResult.versions.length === 0) {
        throw new Error('No versions found');
      }

      // Get latest version data
      const latestVersion = versionsResult.versions[0];
      const versionData = await this.versionManager.getVersionData(roomname, latestVersion.timestamp);
      
      // Parse Y.js document
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, versionData);
      
      let nodeContent = null;
      let foundNode = null;
      
      // Get the specific node from the nodes map
      const yNodes = ydoc.getMap('nodes');
      
      if (yNodes && yNodes.has(nodeId)) {
        foundNode = yNodes.get(nodeId);
        nodeContent = this.extractContentFromNode(foundNode);
      }
      
      if (!foundNode) {
        throw new Error(`Node ${nodeId} not found`);
      }
      
      return {
        content: nodeContent,
        nodeType: foundNode.type || 'unknown',
        timestamp: latestVersion.timestamp
      };
    } catch (error) {
      throw new Error(`Failed to extract node content: ${error.message}`);
    }
  }

  // Helper to extract meaningful content from a node
  extractContentFromNode(node) {
    if (!node || typeof node !== 'object') {
      return 'No content available';
    }
    
    // Try different content fields based on node type
    if (node.data) {
      // ArtifactLatchNode content priority (mirroring getDisplayContent logic)
      if (node.type === 'artifactLatchNode') {
        // If locked, prefer lockedContent
        if (node.data.isLocked && node.data.lockedContent) {
          return node.data.lockedContent;
        }
        // If flowing, prefer interpolatedOutput (compiled text from connections)
        if (node.data.interpolatedOutput) {
          return node.data.interpolatedOutput;
        }
        // Fallback to currentContent
        if (node.data.currentContent) {
          return node.data.currentContent;
        }
      }
      
      // TextNode content priority - prefer compiled/interpolated content over template
      if (node.type === 'textNode') {
        // Prefer interpolatedOutputs (compiled content) over content (template)
        if (node.data.interpolatedOutputs && Array.isArray(node.data.interpolatedOutputs) && node.data.interpolatedOutputs.length > 0) {
          // Return the first interpolated output's content, or join all if multiple
          if (node.data.interpolatedOutputs.length === 1) {
            return node.data.interpolatedOutputs[0].content;
          } else {
            // Multiple outputs - join them with section separators
            return node.data.interpolatedOutputs
              .map(output => `=== ${output.name} ===\n${output.content}`)
              .join('\n\n');
          }
        }
        // Fallback to template content
        if (node.data.content) {
          return node.data.content;
        }
      }
      
      // LLM Node content priority
      if (node.data.lastOutput) return node.data.lastOutput; // LLM nodes - prefer output over prompt
      
      // Standard content fields for other node types
      if (node.data.content) return node.data.content;
      if (node.data.text) return node.data.text;
      if (node.data.value) return node.data.value;
      if (node.data.currentContent) return node.data.currentContent; // Generic fallback
    }
    
    // Fallback to node properties
    if (node.content) return node.content;
    if (node.text) return node.text;
    if (node.value) return node.value;
    
    // Last resort: return type info
    return `Node of type: ${node.type || 'unknown'}`;
  }
}